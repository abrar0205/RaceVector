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
let catalog = null;
let activeMeeting = null;
let apiQueue = Promise.resolve();
let lastApiCall = 0;
const READY_DELAY = 31 * 60 * 1000; // OpenF1 historical access starts 30 minutes after a session ends.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = session => session && Number.isFinite(Date.parse(session.date_end)) && Date.now() > Date.parse(session.date_end) + READY_DELAY;
const dateLabel = date => {const d = new Date(date);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d):'DATE TBC';};
function queueApi(fn){
  const task = apiQueue.catch(()=>{}).then(async()=>{
    await sleep(Math.max(0, lastApiCall + 700 - Date.now()));
    lastApiCall = Date.now();
    return fn();
  });
  apiQueue = task.catch(()=>{});
  return task;
}

const NUM = n => (n===null||n===undefined||n==='')?null:(Number.isFinite(Number(n))?Number(n):null);
const stamp = x => {const t = Date.parse(x);return Number.isFinite(t)?t:NaN};
const pretty = seconds => seconds==null?'NO LAP':seconds.toFixed(3)+' S';
const clock = t => {if(!Number.isFinite(t))return '00:00.0';const m=Math.floor(t/60),s=t%60;return String(m).padStart(2,'0')+':'+s.toFixed(1).padStart(4,'0')};
function setStatus(text,type=''){el.status.textContent=text;el.led.className='status-led '+type;}
// Cache immutable historical responses in the visitor's browser and rate-limit all
// shared OpenF1 requests. Do not persist or redistribute raw telemetry in GitHub.
async function request(endpoint,params={},options={}){
  const url=new URL(API+'/'+endpoint);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  let cache=null;
  if('caches' in window && options.cache!==false){
    try {cache=await caches.open('racevector-historical-v2');
      const hit=await cache.match(url.toString());
      if(hit){const data=await hit.json();if(Array.isArray(data))return data;}
    } catch {cache=null;}
  }
  const attempts=options.optional?1:4;
  for(let attempt=0;attempt<attempts;attempt++){
    let response;
    try {response=await queueApi(()=>fetch(url.toString(),{headers:{Accept:'application/json'}}));}
    catch(error){if(options.optional)return [];if(attempt===attempts-1)throw error;await sleep(1200*(attempt+1));continue;}
    if(response.ok){
      const json=await response.json();
      if(!Array.isArray(json))throw new Error('Unexpected OpenF1 '+endpoint+' response');
      if(cache && json.length){try{await cache.put(url.toString(),new Response(JSON.stringify(json),{headers:{'Content-Type':'application/json'}}));}catch {/* storage may be full */}}
      return json;
    }
    if(options.optional){console.warn('RaceVector: optional '+endpoint+' unavailable (HTTP '+response.status+')');return [];}
    if(response.status!==429 && response.status<500)throw new Error('OpenF1 '+endpoint+' returned HTTP '+response.status);
    if(attempt===attempts-1){
      if(response.status===429)throw new Error('OpenF1 is temporarily rate-limiting requests. Please retry in a minute; previously loaded sessions remain cached.');
      throw new Error('OpenF1 '+endpoint+' is temporarily unavailable (HTTP '+response.status+').');
    }
    const retrySeconds=Number(response.headers.get('Retry-After'));
    const delay=Number.isFinite(retrySeconds)&&retrySeconds>0?Math.min(30000,retrySeconds*1000):Math.min(14000,1800*2**attempt);
    setStatus('API BUSY / RETRYING '+(attempt+1)+'/'+(attempts-1));
    await sleep(delay);
  }
  return [];
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
function selectedSession(){
  return activeMeeting?.sessions?.find(s=>String(s.session_key)===el.session.value)??null;
}
async function fetchCarLap(session,driver,lap){
  const start=stamp(lap.date_start),end=start+lap.lap_duration*1000;
  const query={session_key:session.session_key,driver_number:driver.driver_number,'date>':new Date(start).toISOString(),'date<':new Date(end).toISOString()};
  const car=await request('car_data',query);
  return {driver_number:driver.driver_number,name:driver.name_acronym||driver.broadcast_name||String(driver.driver_number),fullName:driver.full_name||'',lap_duration:lap.lap_duration,
    session_key:session.session_key,meeting_key:session.meeting_key,car:cleanSamples(car,start,end),positions:[],query,start,end};
}
async function loadOnline(){
  const session=selectedSession();
  if(!session||!ready(session))throw new Error('This session is scheduled or still within the historical-data delay. Select a completed session.');
  // Session metadata is prebuilt once daily. Only two small metadata queries and
  // two measured car traces are required to display charts and driver comparison.
  const drivers=await request('drivers',{session_key:session.session_key});
  const laps=await request('laps',{session_key:session.session_key});
  const distinct=new Map(drivers.map(d=>[d.driver_number,d]));
  const selected=fastestLaps(laps,new Set(distinct.keys()));
  if(selected.length<2)throw new Error('This session does not yet have two complete timed laps. Try another session.');
  const output=[];
  for(const lap of selected){
    const l=await fetchCarLap(session,distinct.get(lap.driver_number),lap);
    if(l.car.length<12)throw new Error('Selected lap telemetry is incomplete. Try another session.');
    output.push(l);
  }
  // Positions are OPTIONAL and never block speed traces. Keep requests serial;
  // a 429 for the first track request skips the second to respect the free API.
  for(const l of output){
    const pos=await request('location',l.query,{optional:true});
    l.positions=cleanLocation(pos,l.start,l.end);
    delete l.query;delete l.start;delete l.end;
    if(l.positions.length<3)break;
  }
  return {session, laps:output};
}
async function loadLocal(){
  // Local historical exports are optional. The public Pages build ships only
  // schedule metadata, not downloadable raw car data or positions.
  if(!activeMeeting)return null;
  const filename=[el.season.value,activeMeeting.country_name.toLowerCase().replace(/\s+/g,'-'),selectedSession()?.session_name?.toLowerCase()].join('-')+'.json';
  try {const res=await fetch('./data/'+filename,{cache:'no-cache'});if(!res.ok)return null;
    const data=await res.json();if(data.source!=='OpenF1 historical API'||!Array.isArray(data.laps)||data.laps.length<2)return null;
    if(data.laps.some(l=>!l.car?.length))return null;return data;
  } catch {return null;}
}

function allMeetings(){return (catalog?.seasons??[]).flatMap(s=>s.meetings.map(m=>({...m,year:s.year})));}
function allSessions(){return allMeetings().flatMap(m=>m.sessions.map(s=>({...s,meeting:m})));}
function latestCompleted(){
  // Prefer the most recent FINISHED RACE, not an incomplete race weekend.
  return allSessions().filter(ready).sort((a,b)=>Date.parse(b.date_end)-Date.parse(a.date_end))[0]??null;
}
function latestCompletedRace(){
  return allSessions().filter(s=>ready(s)&&s.session_name==='Race').sort((a,b)=>Date.parse(b.date_end)-Date.parse(a.date_end))[0]
    ??allSessions().filter(ready).sort((a,b)=>Date.parse(b.date_end)-Date.parse(a.date_end))[0]??null;
}
function nextScheduled(){
  return allSessions().filter(s=>!ready(s)&&Number.isFinite(stamp(s.date_start))&&stamp(s.date_start)>Date.now())
    .sort((a,b)=>stamp(a.date_start)-stamp(b.date_start))[0]??null;
}
function choose(session){
  if(!session)return;
  el.season.value=String(session.meeting.year);
  populateMeetings(String(session.meeting.meeting_key),String(session.session_key));
}
function populateMeetings(preferredMeeting=null,preferredSession=null){
  const season=catalog?.seasons.find(s=>String(s.year)===el.season.value);
  const meetings=[...(season?.meetings??[])].sort((a,b)=>stamp(b.date_start)-stamp(a.date_start));
  el.country.replaceChildren(...meetings.map(m=>{const o=document.createElement('option');o.value=String(m.meeting_key);o.textContent=m.meeting_name.toUpperCase();return o;}));
  if(preferredMeeting&&meetings.some(m=>String(m.meeting_key)===preferredMeeting))el.country.value=preferredMeeting;
  populateSessions(preferredSession);
}
function populateSessions(preferredSession=null){
  const season=catalog?.seasons.find(s=>String(s.year)===el.season.value);
  activeMeeting=season?.meetings.find(m=>String(m.meeting_key)===el.country.value)??null;
  const sessions=[...(activeMeeting?.sessions??[])].sort((a,b)=>stamp(b.date_start)-stamp(a.date_start));
  el.session.replaceChildren(...sessions.map(x=>{const o=document.createElement('option');o.value=String(x.session_key);
    o.textContent=x.session_name.toUpperCase()+(ready(x)?' ✓':' · SCHEDULED');return o;}));
  const first= sessions.find(s=>ready(s)&&s.session_name==='Race')??sessions.find(ready)??sessions[0];
  if(preferredSession&&sessions.some(x=>String(x.session_key)===preferredSession))el.session.value=preferredSession;
  else if(first)el.session.value=String(first.session_key);
  syncSelection();
}
function syncSelection(){
  const s=selectedSession(),valid=ready(s);
  el.load.disabled=!valid;
  el.load.innerHTML=(valid?'LOAD RECORDED SESSION':'AWAITING SESSION')+' <span>↗</span>';
  if(!s){setStatus('NO SESSION IN CALENDAR');return;}
  if(!valid)setStatus('SCHEDULED / TELEMETRY AFTER SESSION');
  else setStatus('RECORDED SESSION AVAILABLE');
  const label=document.getElementById('selected-round');
  if(label)label.textContent=(activeMeeting?.meeting_name??'GRAND PRIX')+' · '+s.session_name+' · '+dateLabel(s.date_start)+(valid?' / RECORDED':' / SCHEDULED');
}
function updateRoundSummary(){
  const last=latestCompletedRace(),next=nextScheduled();
  const latestLabel=document.getElementById('latest-round-label'),nextLabel=document.getElementById('next-round-label');
  if(latestLabel)latestLabel.textContent=last?last.meeting.meeting_name+' · '+dateLabel(last.date_start):'NO RECORDED RACE';
  if(nextLabel)nextLabel.textContent=next?next.meeting.meeting_name+' · '+dateLabel(next.date_start):'CALENDAR NOT RELEASED';
  const latestButton=document.getElementById('latest-race'),nextButton=document.getElementById('next-race');
  latestButton.disabled=!last;nextButton.disabled=!next;
  latestButton.addEventListener('click',()=>choose(last));nextButton.addEventListener('click',()=>choose(next));
  const freshness=document.getElementById('calendar-updated');
  if(freshness)freshness.textContent='SOURCE SYNC '+dateLabel(catalog.updated_at)+' / '+allMeetings().length+' WEEKENDS';
}
async function initCatalog(){
  setStatus('LOADING RACE CALENDAR');
  try{
    const response=await fetch('./data/catalog.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('Calendar metadata not deployed');
    const data=await response.json();
    if(!Array.isArray(data.seasons)||!data.seasons.some(s=>s.meetings?.length))throw new Error('Invalid calendar metadata');
    catalog=data;
    const years=[...catalog.seasons].sort((a,b)=>b.year-a.year);
    el.season.replaceChildren(...years.map(s=>{const o=document.createElement('option');o.value=String(s.year);o.textContent=String(s.year);return o;}));
    const last=latestCompletedRace();
    if(last)choose(last);
    else {el.season.value=String(years[0].year);populateMeetings();}
    updateRoundSummary();
  }catch(error){
    console.error('RaceVector calendar could not be loaded:',error);
    setStatus('CALENDAR UNAVAILABLE / RETRY LATER','error');
    el.load.disabled=true;
    const label=document.getElementById('selected-round');
    if(label)label.textContent='Race calendar is temporarily unavailable. Please refresh to retry.';
  }
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
    const trackAvailable=state.laps[0].positions.length>=3;
    el.overlay.hidden=trackAvailable;
    if(!trackAvailable){
      el.overlay.querySelector('strong').textContent='POSITION DATA UNAVAILABLE';
      el.overlay.querySelector('p').textContent='Recorded speed, throttle, braking and both lap traces are available below. OpenF1 location samples are currently missing or rate-limited; the charts still work.';
    }
    el.a.textContent=data.laps[0].name;el.b.textContent=data.laps[1].name;
    el.at.textContent=pretty(data.laps[0].lap_duration);el.bt.textContent=pretty(data.laps[1].lap_duration);
    $('legend-a').textContent=data.laps[0].name;$('legend-b').textContent=data.laps[1].name;
    $('track-source').textContent=trackAvailable?(activeMeeting?.circuit_short_name||'APPROXIMATE LOCATIONS'):'POSITION FEED UNAVAILABLE';
    $('track-meta').textContent=trackAvailable?(activeMeeting?.circuit_short_name||'AVAILABLE'):'TELEMETRY ONLY';
    $('provenance-session').textContent='SESSION '+data.session.session_key+' / '+(data.session.session_name||el.session.value);
    el.play.disabled=false;el.restart.disabled=false;el.scrub.disabled=false;
    renderChart();render();setStatus(trackAvailable?'REAL SESSION LOADED':'TELEMETRY LOADED / TRACK OPTIONAL','active');
  }catch(error){setStatus('DATA NOT AVAILABLE','error');el.overlay.hidden=false;el.overlay.querySelector('strong').textContent='TELEMETRY NOT AVAILABLE';el.overlay.querySelector('p').textContent=error.message+' You can also pre-export a real historical session using the ingestion script.';}
  finally{el.load.disabled=!ready(selectedSession());el.load.innerHTML='LOAD RECORDED SESSION <span>↗</span>';}
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
el.season.addEventListener('change',()=>populateMeetings());
el.country.addEventListener('change',()=>populateSessions());
el.session.addEventListener('change',syncSelection);
el.load.addEventListener('click',load);el.play.addEventListener('click',togglePlay);el.restart.addEventListener('click',()=>{pause();state.progress=0;render()});el.scrub.addEventListener('input',()=>{pause();state.progress=Number(el.scrub.value)/1000;render()});
window.addEventListener('resize',()=>{drawTrack()},{passive:true});document.addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.code==='Space'&&state.laps.length){e.preventDefault();togglePlay()}if(e.key==='ArrowRight'&&state.laps.length){pause();state.progress=Math.min(1,state.progress+.01);render()}if(e.key==='ArrowLeft'&&state.laps.length){pause();state.progress=Math.max(0,state.progress-.01);render()}});
drawTrack();
initCatalog();

// Track scroll reading progress, not race progress. No fictional timing data.
const progressRail = document.getElementById('race-progress-bar');
function updateReadingProgress(){const total=document.documentElement.scrollHeight-innerHeight;progressRail.style.width=(total>0?Math.min(100,scrollY/total*100):0)+'%';}
window.addEventListener('scroll',updateReadingProgress,{passive:true});updateReadingProgress();