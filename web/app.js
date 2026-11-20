/* RaceVector visual prototype: real historical OpenF1 responses only.
   There is deliberately no synthetic telemetry and no fabricated AI output. */
const $ = id => document.getElementById(id);
const API = 'https://api.openf1.org/v1';
const el = {
  season:$('season'),country:$('country'),session:$('session'),load:$('load'),
  track:$('track'),overlay:$('track-overlay'),status:$('status-text'),led:$('status-led'),
  a:$('driver-a'),b:$('driver-b'),at:$('driver-a-time'),bt:$('driver-b-time'),
  speedA:$('speed-a'),speedB:$('speed-b'),throttle:$('throttle-meter'),brake:$('brake-meter'),
  throttleN:$('throttle-n'),brakeN:$('brake-n'),chartA:$('chart-a'),chartB:$('chart-b'),
  cursor:$('chart-playhead'),play:$('play'),restart:$('restart'),scrub:$('scrub'),time:$('play-time'),percent:$('play-percent')
};
let state = {laps:[],progress:0,playing:false,previousFrame:0,animationId:0,session:null};
const NUM = n => (n===null||n===undefined||n==='')?null:(Number.isFinite(Number(n))?Number(n):null);
const stamp = x => {const t = Date.parse(x);return Number.isFinite(t)?t:NaN};
const pretty = seconds => seconds==null?'NO LAP':seconds.toFixed(3)+' S';
const clock = t => {if(!Number.isFinite(t))return '00:00.0';const m=Math.floor(t/60),s=t%60;return String(m).padStart(2,'0')+':'+s.toFixed(1).padStart(4,'0')};
function setStatus(text,type=''){el.status.textContent=text;el.led.className='status-led '+type;}
async function request(endpoint,params={}){
  const url=new URL(API+'/'+endpoint);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetch(url.toString(),{headers:{'Accept':'application/json'}});
  if(!response.ok)throw new Error('OpenF1 '+endpoint+' returned HTTP '+response.status);
  const json=await response.json();if(!Array.isArray(json))throw new Error('Unexpected OpenF1 response');return json;
}
function fastestLaps(laps,driverNumbers){
  const quickest=new Map();
  for(const lap of laps){
    if(!driverNumbers.has(lap.driver_number)||lap.is_pit_out_lap===true||!lap.date_start)continue;
    const time=NUM(lap.lap_duration);if(time==null||time<45||time>240)continue;
    const old=quickest.get(lap.driver_number);
    if(!old||time<old.lap_duration)quickest.set(lap.driver_number,{...lap,lap_duration:time});
  }
  return [...quickest.values()].sort((a,b)=>a.lap_duration-b.lap_duration).slice(0,2);
}
function cleanSamples(raw,start,end){
  return raw.map(r=>({t:(stamp(r.date)-start)/1000,speed:NUM(r.speed),throttle:NUM(r.throttle),brake:r.brake===null||r.brake===undefined?null:(Number(r.brake)===1?1:0),gear:NUM(r.n_gear),rpm:NUM(r.rpm)}))
   .filter(r=>Number.isFinite(r.t)&&r.t>=-.2&&r.t<=(end-start)/1000+.2&&r.speed!=null&&r.speed>=0&&r.speed<390)
   .sort((a,b)=>a.t-b.t).filter((r,i,arr)=>i===0||r.t>arr[i-1].t);
}
function cleanLocation(raw,start,end){
  return raw.map(r=>({t:(stamp(r.date)-start)/1000,x:NUM(r.x),y:NUM(r.y)}))
    .filter(r=>Number.isFinite(r.t)&&r.t>=-.2&&r.t<=(end-start)/1000+.2&&r.x!=null&&r.y!=null)
    .sort((a,b)=>a.t-b.t).filter((r,i,arr)=>i===0||r.t>arr[i-1].t);
}
async function fetchLap(session,driver,lap){
  const start=stamp(lap.date_start),end=start+lap.lap_duration*1000;
  const query={session_key:session.session_key,driver_number:driver.driver_number,'date>':new Date(start).toISOString(),'date<':new Date(end).toISOString()};
  const [car,pos]=await Promise.all([request('car_data',query),request('location',query)]);
  return {driver_number:driver.driver_number,name:driver.name_acronym||driver.broadcast_name||String(driver.driver_number),fullName:driver.full_name||'',lap_duration:lap.lap_duration,
    session_key:session.session_key,meeting_key:session.meeting_key,car:cleanSamples(car,start,end),positions:cleanLocation(pos,start,end)};
}
async function loadOnline(){
  const year=Number(el.season.value),country=el.country.value,type=el.session.value;
  const sessions=await request('sessions',{year,country_name:country,session_name:type});
  if(!sessions.length)throw new Error('No matching historical session. Select another Grand Prix or season.');
  const session=sessions.find(s=>s.session_type!=='Testing')??sessions[0];
  const [drivers,laps]=await Promise.all([request('drivers',{session_key:session.session_key}),request('laps',{session_key:session.session_key})]);
  const distinct=new Map(drivers.map(d=>[d.driver_number,d]));
  const selected=fastestLaps(laps,new Set(distinct.keys()));
  if(selected.length<2)throw new Error('There are fewer than two qualifying timed laps in the selected session.');
  const output=await Promise.all(selected.map(lap=>fetchLap(session,distinct.get(lap.driver_number),lap)));
  if(output.some(x=>x.car.length<12))throw new Error('Selected lap telemetry is incomplete. Try another session.');
  return {session, laps:output};
}
async function loadLocal(){
  // Optional, deterministic fallback produced by pipeline/ingest.py (not a synthetic dataset).
  const filename=[el.season.value,el.country.value.toLowerCase().replace(/\s+/g,'-'),el.session.value.toLowerCase()].join('-')+'.json';
  try {const res=await fetch('./data/'+filename,{cache:'no-cache'});if(!res.ok)return null;
    const data=await res.json();if(data.source!=='OpenF1 historical API'||!Array.isArray(data.laps)||data.laps.length<2)return null;
    if(data.laps.some(l=>!l.car?.length))return null;return data;
  } catch {return null;}
}
async function load(){
  cancelAnimationFrame(state.animationId);state.playing=false;state.progress=0;state.previousFrame=0;
  state.laps=[];state.session=null;el.play.disabled=true;el.restart.disabled=true;el.scrub.disabled=true;
  el.chartA.setAttribute('d','');el.chartB.setAttribute('d','');el.a.textContent='—';el.b.textContent='—';el.at.textContent='NO LAP';el.bt.textContent='NO LAP';
  el.speedA.textContent='—';el.speedB.textContent='—';el.throttle.style.width='0%';el.brake.style.width='0%';el.throttleN.textContent='—';el.brakeN.textContent='—';
  el.overlay.hidden=false;el.overlay.querySelector('strong').textContent='LOADING REAL TELEMETRY';el.overlay.querySelector('p').textContent='Requesting recorded lap times and car samples from the historical source.';drawTrack();
  el.load.disabled=true;el.load.innerHTML='FETCHING TELEMETRY <span>···</span>';
  setStatus('CONNECTING TO HISTORICAL DATA');
  try{
    const data=await loadLocal()||await loadOnline();
    state.laps=data.laps;state.session=data.session;state.progress=0;
    el.overlay.hidden=state.laps[0].positions.length>=3;
    el.a.textContent=data.laps[0].name;el.b.textContent=data.laps[1].name;
    el.at.textContent=pretty(data.laps[0].lap_duration);el.bt.textContent=pretty(data.laps[1].lap_duration);
    $('legend-a').textContent=data.laps[0].name;$('legend-b').textContent=data.laps[1].name;
    $('track-source').textContent=data.session.circuit_short_name||'APPROXIMATE LOCATIONS';
    $('track-meta').textContent=data.session.circuit_short_name||'AVAILABLE';
    $('provenance-session').textContent='SESSION '+data.session.session_key+' / '+(data.session.session_name||el.session.value);
    el.play.disabled=false;el.restart.disabled=false;el.scrub.disabled=false;
    renderChart();render();setStatus('REAL SESSION LOADED','active');
  }catch(error){setStatus('DATA NOT AVAILABLE','error');el.overlay.hidden=false;el.overlay.querySelector('strong').textContent='TELEMETRY NOT AVAILABLE';el.overlay.querySelector('p').textContent=error.message+' You can also pre-export a real historical session using the ingestion script.';}
  finally{el.load.disabled=false;el.load.innerHTML='LOAD REAL SESSION <span>↗</span>';}
}
function interpAt(items,t){
  if(!items.length)return null;
  if(t<=items[0].t)return items[0];if(t>=items[items.length-1].t)return items[items.length-1];
  let lo=0,hi=items.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(items[mid].t<t)lo=mid;else hi=mid;}
  const a=items[lo],b=items[hi],alpha=(t-a.t)/(b.t-a.t||1);let out={t};
  for(const key of Object.keys(a))if(key!=='t'&&typeof a[key]==='number'&&typeof b[key]==='number')out[key]=a[key]+(b[key]-a[key])*alpha;
  return out;
}
function plot(samples,duration){if(samples.length<2)return '';
  return samples.map((p,i)=>`${i?'L':'M'}${(28+852*p.t/duration).toFixed(1)},${(216-178*Math.min(380,Math.max(0,p.speed))/380).toFixed(1)}`).join(' ');
}
function renderChart(){const [a,b]=state.laps;el.chartA.setAttribute('d',plot(a.car,a.lap_duration));el.chartB.setAttribute('d',plot(b.car,b.lap_duration));}
function render(){if(!state.laps.length)return;
  const [a,b]=state.laps,pa=interpAt(a.car,state.progress*a.lap_duration),pb=interpAt(b.car,state.progress*b.lap_duration);
  const val=x=>Number.isFinite(x)?Math.round(x).toLocaleString('en-GB'):'—';
  el.speedA.innerHTML=val(pa?.speed)+' <small>KM/H</small>';el.speedB.innerHTML=val(pb?.speed)+' <small>KM/H</small>';
  el.throttle.style.width=(Number.isFinite(pa?.throttle)?Math.min(100,Math.max(0,pa.throttle)):0)+'%';
  el.brake.style.width=(Number.isFinite(pa?.brake)?Math.min(100,Math.max(0,pa.brake*100)):0)+'%';
  el.throttleN.textContent=Number.isFinite(pa?.throttle)?Math.round(pa.throttle)+'%':'—';el.brakeN.textContent=Number.isFinite(pa?.brake)?pa.brake>.5?'ON':'OFF':'—';
  el.time.textContent=clock(state.progress*a.lap_duration);el.percent.textContent=String(Math.round(state.progress*100)).padStart(2,'0')+'%';
  el.scrub.value=String(Math.round(state.progress*1000));const x=28+state.progress*852;el.cursor.setAttribute('x1',String(x));el.cursor.setAttribute('x2',String(x));drawTrack();
}
function frame(timestamp){if(!state.playing)return;if(state.previousFrame){let dt=Math.min(timestamp-state.previousFrame,80);state.progress+=dt/(state.laps[0].lap_duration*1000)*Number(document.getElementById('replay-rate')?.value||2.5);}
  state.previousFrame=timestamp;if(state.progress>=1){state.progress=1;pause();}render();if(state.playing)state.animationId=requestAnimationFrame(frame);
}
function pause(){state.playing=false;state.previousFrame=0;el.play.textContent='▶';el.play.setAttribute('aria-label','Play telemetry replay');}
function togglePlay(){if(!state.laps.length)return;if(state.playing){pause();cancelAnimationFrame(state.animationId);}else{if(state.progress>=1)state.progress=0;state.playing=true;el.play.textContent='Ⅱ';el.play.setAttribute('aria-label','Pause telemetry replay');state.animationId=requestAnimationFrame(frame);}}
function project(pos,w,h){let xs=pos.map(p=>p.x),ys=pos.map(p=>p.y);const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const spanx=Math.max(1,maxx-minx),spany=Math.max(1,maxy-miny),scale=Math.min(w*.76/spanx,h*.74/spany);
  const ox=(w-spanx*scale)/2,oy=(h-spany*scale)/2;
  return pos.map(p=>({...p,px:ox+(p.x-minx)*scale,py:h-(oy+(p.y-miny)*scale)}));
}
function drawTrack(){
  const can=el.track,rect=can.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
  const cw=Math.ceil(w*dpr),ch=Math.ceil(h*dpr);if(can.width!==cw||can.height!==ch){can.width=cw;can.height=ch;}const ctx=can.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(175,217,173,.06)';ctx.lineWidth=1;for(let x=0;x<w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(!state.laps.length||state.laps[0].positions.length<3)return;
  const a=state.laps[0],b=state.laps[1],points=project(a.positions,w,h);
  function strokePath(line,width,color,blur=0){ctx.beginPath();line.forEach((p,i)=>i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=blur;ctx.shadowColor=color;ctx.stroke();ctx.shadowBlur=0;}
  strokePath(points,17,'rgba(35,54,47,.9)');strokePath(points,9,'rgba(76,99,87,.75)');
  const maxT=a.lap_duration;for(let i=1;i<points.length;i++){
    const p=points[i-1],q=points[i],v=interpAt(a.car,(p.t+q.t)/2)?.speed??0;
    const hue=Math.max(0,Math.min(190,190-v/380*190));
    ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(q.px,q.py);ctx.strokeStyle=`hsl(${hue} 83% 66%)`;ctx.lineWidth=3.5;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=6;ctx.stroke();ctx.shadowBlur=0;
  }
  function marker(lap,color,letter){if(lap.positions.length<2)return;const p=interpAt(lap.positions,lap.lap_duration*state.progress);if(!p||p.x==null)return;
    const minx=Math.min(...a.positions.map(q=>q.x)),maxx=Math.max(...a.positions.map(q=>q.x)),miny=Math.min(...a.positions.map(q=>q.y)),maxy=Math.max(...a.positions.map(q=>q.y)),scale=Math.min(w*.76/Math.max(1,maxx-minx),h*.74/Math.max(1,maxy-miny));
    const x=(w-(maxx-minx)*scale)/2+(p.x-minx)*scale,y=h-((h-(maxy-miny)*scale)/2+(p.y-miny)*scale);
    ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fillStyle=color+'27';ctx.fill();ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.fillStyle='#10171c';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(letter,x,y-19);
  }marker(a,'#ff4540','A');marker(b,'#42d7e6','B');
}
el.load.addEventListener('click',load);el.play.addEventListener('click',togglePlay);el.restart.addEventListener('click',()=>{pause();state.progress=0;render()});el.scrub.addEventListener('input',()=>{pause();state.progress=Number(el.scrub.value)/1000;render()});
window.addEventListener('resize',()=>{drawTrack()},{passive:true});document.addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.code==='Space'&&state.laps.length){e.preventDefault();togglePlay()}if(e.key==='ArrowRight'&&state.laps.length){pause();state.progress=Math.min(1,state.progress+.01);render()}if(e.key==='ArrowLeft'&&state.laps.length){pause();state.progress=Math.max(0,state.progress-.01);render()}});
drawTrack();

// Track scroll reading progress, not race progress. No fictional timing data.
const progressRail = document.getElementById('race-progress-bar');
function updateReadingProgress(){const total=document.documentElement.scrollHeight-innerHeight;progressRail.style.width=(total>0?Math.min(100,scrollY/total*100):0)+'%';}
window.addEventListener('scroll',updateReadingProgress,{passive:true});updateReadingProgress();
