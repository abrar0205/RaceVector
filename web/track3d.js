/* 3D approximation of published OpenF1 car-location coordinates.
   No inferred racing line, no synthetic track positions or car physics. */
import * as THREE from './vendor/three/three.module.js';

export function createTrack3D(host,laps){
  if(!host||laps[0]?.positions?.length<3)throw Error('Real car-position telemetry is required for 3D reconstruction');
  const samples=laps[0].positions;
  const xs=samples.map(p=>p.x),ys=samples.map(p=>p.y);
  const midX=(Math.min(...xs)+Math.max(...xs))/2,midY=(Math.min(...ys)+Math.max(...ys))/2;
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1);
  const transform=p=>new THREE.Vector3((p.x-midX)*46/span,0,(p.y-midY)*-46/span);
  const points=samples.filter((p,i)=>i%Math.max(1,Math.floor(samples.length/650))===0||i===samples.length-1)
    .map(p=>({t:p.t,position:transform(p)}));
  const scene=new THREE.Scene();scene.background=new THREE.Color('#080c12');scene.fog=new THREE.FogExp2('#080c12',0.013);
  const rect=host.getBoundingClientRect();
  const camera=new THREE.PerspectiveCamera(40,Math.max(1,rect.width)/Math.max(1,rect.height),0.1,200);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setSize(rect.width||600,rect.height||420);host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D reconstructed circuit from approximate recorded car-location samples. Drag to orbit, scroll to zoom.');
  renderer.domElement.style.touchAction='pan-y';
  scene.add(new THREE.GridHelper(100,30,0x2c3d48,0x18212c));
  const halo=new THREE.Mesh(new THREE.CircleGeometry(32,70),new THREE.MeshBasicMaterial({color:0xd7242a,transparent:true,opacity:.025,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=-1.35;scene.add(halo);
  function speedAt(t){const car=laps[0].car;if(!car?.length)return null;let low=0,hi=car.length-1;while(low+1<hi){const m=(low+hi)>>1;if(car[m].t<t)low=m;else hi=m;}const a=car[low],b=car[hi],f=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t||1)));return a.speed+(b.speed-a.speed)*f;}
  const curve=new THREE.CatmullRomCurve3(points.map(p=>p.position),false,'centripetal',.2);
  const geometry=new THREE.TubeGeometry(curve,Math.min(1000,Math.max(64,points.length*2)),.31,8,false);
  const colors=[];const tubeN=geometry.parameters.tubularSegments,tubeR=geometry.parameters.radialSegments;
  const c1=new THREE.Color('#ff443f'),c2=new THREE.Color('#49d9e9'),color=new THREE.Color();
  for(let i=0;i<=tubeN;i++){
    const t=points[0].t+(points[points.length-1].t-points[0].t)*i/tubeN;
    const speed=speedAt(t);color.copy(c1).lerp(c2,Math.max(0,Math.min(1,(speed??0)/360)));
    for(let j=0;j<=tubeR;j++)colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const road=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true}));road.position.y=.1;scene.add(road);
  const glow=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(1.014,1.1,1.014);glow.position.y=.1;scene.add(glow);
  const base=new THREE.Mesh(new THREE.TubeGeometry(curve,tubeN,.85,7,false),new THREE.MeshBasicMaterial({color:0x2a333e,transparent:true,opacity:.27,depthWrite:false}));base.position.y=-.12;scene.add(base);
  const markerA=new THREE.Mesh(new THREE.SphereGeometry(.63,14,12),new THREE.MeshBasicMaterial({color:0xff524a}));
  const markerB=new THREE.Mesh(new THREE.SphereGeometry(.63,14,12),new THREE.MeshBasicMaterial({color:0x53e5ef}));
  const auraA=new THREE.Mesh(new THREE.SphereGeometry(.98,14,10),new THREE.MeshBasicMaterial({color:0xff5544,transparent:true,opacity:.18,depthWrite:false}));
  const auraB=new THREE.Mesh(new THREE.SphereGeometry(.98,14,10),new THREE.MeshBasicMaterial({color:0x55e5ee,transparent:true,opacity:.18,depthWrite:false}));
  scene.add(markerA,markerB,auraA,auraB);
  const label=document.createElement('div');label.className='track3d-caption';label.textContent='OPENF1 POSITION / APPROXIMATE GEOMETRY · DRAG TO ORBIT';host.appendChild(label);
  let theta=-.42,phi=.95,zoom=72,dragging=false,lastX=0,lastY=0,disposed=false,progress=0,lastDraw=0;
  function moveMarker(lap,mesh,aura,color,percent){
    if(!lap.positions?.length){mesh.visible=false;aura.visible=false;return;}
    const target=lap.lap_duration*percent;const data=lap.positions;let lo=0,hi=data.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(data[mid].t<target)lo=mid;else hi=mid;}
    const p=data[lo],q=data[hi],r=Math.max(0,Math.min(1,(target-p.t)/(q.t-p.t||1)));
    const v=transform({x:p.x+(q.x-p.x)*r,y:p.y+(q.y-p.y)*r});v.y=.8;
    mesh.position.copy(v);aura.position.copy(v);mesh.visible=true;aura.visible=true;
  }
  function setProgress(p){progress=p;moveMarker(laps[0],markerA,auraA,'A',p);moveMarker(laps[1],markerB,auraB,'B',p);}
  setProgress(0);
  const down=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!dragging)return;theta+=(e.clientX-lastX)*.008;phi=Math.max(.36,Math.min(1.38,phi+(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY;};
  const up=()=>{dragging=false;};
  const wheel=e=>{e.preventDefault();zoom=Math.max(38,Math.min(115,zoom+e.deltaY*.035));};
  const canvas=renderer.domElement;canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
  function frame(now){if(disposed)return;requestAnimationFrame(frame);if(document.hidden||now-lastDraw<30)return;lastDraw=now;
    camera.position.set(Math.sin(theta)*Math.cos(phi)*zoom,Math.sin(phi)*zoom,Math.cos(theta)*Math.cos(phi)*zoom);
    camera.lookAt(0,0,0);renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
  return {setProgress,resize,dispose(){disposed=true;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);scene.traverse(node=>{node.geometry?.dispose?.();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose());}});renderer.dispose();host.replaceChildren();}};
}