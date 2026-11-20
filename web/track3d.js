/* RaceVector WebGL circuit viewer.
   Measured geometry: OpenF1 approximate car locations, with speed-colored segments.
   Fallback geometry: MIT-licensed geographic circuit outline, monochrome only.
   No fictional racing line, positional car markers, or speed coloring is invented. */
import * as THREE from './vendor/three/three.module.js';

function extent(points){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)};
}
function interpolate(items,t){
  if(!items.length)return null;
  if(t<=items[0].t)return items[0];
  if(t>=items[items.length-1].t)return items[items.length-1];
  let lo=0,hi=items.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(items[mid].t<t)lo=mid;else hi=mid;}
  const a=items[lo],b=items[hi];const f=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t||1)));
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
}
export function createTrack3D(host,{laps=[],outline=null,onError=()=>{}}={}){
  const measured=Array.isArray(laps[0]?.positions)&&laps[0].positions.length>=6;
  const positions=measured?laps[0].positions:((window.RaceVectorCircuits?.points(outline))||[]);
  if(positions.length<4)throw Error('Neither measured car positions nor a licensed circuit outline are available');
  const bounds=extent(positions);
  const dx=bounds.maxx-bounds.minx,dy=bounds.maxy-bounds.miny;
  if(!Number.isFinite(dx+dy)||Math.max(dx,dy)<=0)throw Error('Circuit geometry has no geographic extent');
  const span=Math.max(dx,dy);
  const midX=(bounds.minx+bounds.maxx)/2,midY=(bounds.miny+bounds.maxy)/2;
  const to3d=p=>new THREE.Vector3((p.x-midX)*46/span,0,(p.y-midY)*-46/span);
  const skip=Math.max(1,Math.ceil(positions.length/600));
  const sampled=positions.filter((p,i)=>i%skip===0||i===positions.length-1);
  if(sampled.length<4)throw Error('Too few valid points for a circuit');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#070b12');
  scene.fog=new THREE.FogExp2('#070b12',0.011);
  const camera=new THREE.PerspectiveCamera(40,1,0.1,180);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'default'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-label',measured?'Three-dimensional circuit reconstructed from approximate OpenF1 car locations. Drag to orbit, scroll to zoom.':'Three-dimensional licensed geographic circuit outline. No driver positions are available. Drag to orbit, scroll to zoom.');
  canvas.style.touchAction='none';
  host.appendChild(canvas);
  const grid=new THREE.GridHelper(120,40,0x243242,0x19202c);grid.position.y=-.55;scene.add(grid);
  const halo=new THREE.Mesh(new THREE.CircleGeometry(35,64),new THREE.MeshBasicMaterial({color:0xff393d,transparent:true,opacity:.022,depthWrite:false}));
  halo.rotation.x=-Math.PI/2;halo.position.y=-1.3;scene.add(halo);
  const source=sampled.map(p=>to3d(p));
  const first=sampled[0],last=sampled[sampled.length-1];
  const isClosed=Math.hypot(last.x-first.x,last.y-first.y) / span < .025;
  if(isClosed && source.length>6)source.pop();
  const curve=new THREE.CatmullRomCurve3(source,isClosed,'centripetal',0.3);
  const tubeSegments=Math.min(950,Math.max(110,source.length*2));
  const geometry=new THREE.TubeGeometry(curve,tubeSegments,.34,7,isClosed);
  if(measured){
    const colorSlow=new THREE.Color('#ff4247'),colorFast=new THREE.Color('#43d6eb'),mix=new THREE.Color();
    const colors=[];
    const timeline=laps[0].car||[];
    function speedAt(t){
      if(!timeline.length)return null;
      if(t<=timeline[0].t)return timeline[0].speed;
      if(t>=timeline[timeline.length-1].t)return timeline[timeline.length-1].speed;
      let a=0,b=timeline.length-1;
      while(a+1<b){const m=(a+b)>>1;if(timeline[m].t<t)a=m;else b=m;}
      const p=timeline[a],q=timeline[b],f=(t-p.t)/(q.t-p.t||1);
      return p.speed+(q.speed-p.speed)*f;
    }
    for(let i=0;i<=tubeSegments;i++){
      const sample=sampled[Math.min(sampled.length-1,Math.floor(i/tubeSegments*(sampled.length-1)))];
      const speed=speedAt(sample.t);
      mix.copy(colorSlow).lerp(colorFast,Math.max(0,Math.min(1,(speed??0)/360)));
      for(let j=0;j<=7;j++)colors.push(mix.r,mix.g,mix.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  }
  const road=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial(measured?{vertexColors:true}:{color:0xf14a43}));
  road.position.y=.15;scene.add(road);
  const glow=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial(measured?{vertexColors:true,transparent:true,opacity:.17,blending:THREE.AdditiveBlending,depthWrite:false}:{color:0xff5851,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));
  glow.scale.set(1.025,1.1,1.025);glow.position.y=.15;scene.add(glow);
  const base=new THREE.Mesh(new THREE.TubeGeometry(curve,tubeSegments,.78,7,isClosed),new THREE.MeshBasicMaterial({color:0x303845,transparent:true,opacity:.38,depthWrite:false}));
  base.position.y=-.16;scene.add(base);
  const markers=[0xff5149,0x54e2f0].map(color=>{
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.56,14,12),new THREE.MeshBasicMaterial({color}));
    const aura=new THREE.Mesh(new THREE.SphereGeometry(.98,12,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.19,depthWrite:false}));
    marker.visible=false;aura.visible=false;scene.add(marker,aura);return {marker,aura};
  });
  const caption=document.createElement('div');caption.className='track3d-caption';
  caption.textContent=measured?'OPENF1 APPROXIMATE POSITION + MEASURED SPEED · DRAG / ZOOM':'LICENSED GEO CIRCUIT OUTLINE · NO CAR LOCATION AVAILABLE · DRAG / ZOOM';
  host.appendChild(caption);
  let theta=-.38,phi=.93,zoom=68,dragging=false,lastX=0,lastY=0,disposed=false,progress=0,lastDraw=0,frameId=0;
  function resetCamera(){theta=-.38;phi=.93;zoom=68;}
  function setProgress(value){
    progress=Math.min(1,Math.max(0,Number(value)||0));
    for(let i=0;i<2;i++){
      const lap=laps[i],obj=markers[i];
      if(!measured||!lap?.positions?.length){obj.marker.visible=false;obj.aura.visible=false;continue;}
      const p=interpolate(lap.positions,lap.lap_duration*progress);
      if(!p){obj.marker.visible=false;obj.aura.visible=false;continue;}
      obj.marker.position.copy(to3d(p));obj.marker.position.y=.82;obj.aura.position.copy(obj.marker.position);
      obj.marker.visible=true;obj.aura.visible=true;
    }
  }
  function resize(){const w=host.clientWidth,h=host.clientHeight;
    if(!w||!h)return;
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  }
  const down=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!dragging)return;theta+=(e.clientX-lastX)*.008;phi=Math.max(.25,Math.min(1.39,phi+(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY;};
  const up=()=>{dragging=false;};
  const wheel=e=>{e.preventDefault();zoom=Math.max(29,Math.min(105,zoom+e.deltaY*.036));};
  const lost=e=>{e.preventDefault();onError(Error('3D graphics context was lost. Returned to the 2D circuit.'));};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
  canvas.addEventListener('webglcontextlost',lost);
  const resizeObserver='ResizeObserver' in window?new ResizeObserver(resize):null;
  resizeObserver?.observe(host);
  resize();setProgress(0);
  function frame(now){
    if(disposed)return;
    frameId=requestAnimationFrame(frame);
    if(document.hidden||now-lastDraw<33)return;lastDraw=now;
    camera.position.set(Math.sin(theta)*Math.cos(phi)*zoom,Math.sin(phi)*zoom,Math.cos(theta)*Math.cos(phi)*zoom);
    camera.lookAt(0,0,0);renderer.render(scene,camera);
  }
  frameId=requestAnimationFrame(frame);
  return {setProgress,resize,resetCamera,measured,dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frameId);resizeObserver?.disconnect();
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);
    canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('webglcontextlost',lost);
    scene.traverse(node=>{node.geometry?.dispose?.();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose());}});
    renderer.dispose();host.replaceChildren();
  }};
}