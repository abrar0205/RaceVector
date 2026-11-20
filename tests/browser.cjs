/* Browser QA fixture: deterministic simulated HTTP responses only in the test runner.
   This fixture is NEVER shipped to RaceVector visitors or committed as F1 data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const port=8765;
const address=`http://127.0.0.1:${port}`;
const start='2024-05-25T14:00:00.000Z';
const iso=n=>new Date(Date.parse(start)+n*1000).toISOString();
const meeting={meeting_key:1,meeting_name:'Monaco Grand Prix',country_name:'Monaco',circuit_short_name:'Monte Carlo',date_start:'2024-05-23T09:00:00Z',date_end:'2024-05-26T18:00:00Z',sessions:[{session_key:100,session_name:'Qualifying',session_type:'Qualifying',date_start:'2024-05-25T14:00:00Z',date_end:'2024-05-25T15:15:00Z'}]};
const catalog={schema_version:1,seasons:[{year:2024,meetings:[meeting]}],updated_at:'2024-05-27T09:00:00Z'};
const geo={type:'FeatureCollection',features:[{type:'Feature',properties:{Name:'Circuit de Monaco',Location:'Monaco'},geometry:{type:'LineString',coordinates:[[7.426,43.735],[7.429,43.737],[7.435,43.74],[7.43,43.745],[7.424,43.742],[7.426,43.735]]}}]};
const drivers=[{driver_number:16,name_acronym:'DR-A',full_name:'Test Driver A'},{driver_number:44,name_acronym:'DR-B',full_name:'Test Driver B'}];
const laps=[{driver_number:16,lap_number:1,lap_duration:82,date_start:start},{driver_number:44,lap_number:1,lap_duration:83,date_start:start}];
const car=Array.from({length:250},(_,i)=>({date:iso(i/3),speed:110+35*Math.sin(i/16),throttle:30+Math.round(50*Math.abs(Math.sin(i/19))),brake:0,n_gear:5,rpm:11000}));
const textJSON=r=>JSON.stringify(r);
async function prepare(page){
 await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await page.route('**/data/catalog.json',r=>r.fulfill({status:200,contentType:'application/json',body:textJSON(catalog)}));
 await page.route('**/data/circuits.geojson',r=>r.fulfill({status:200,contentType:'application/json',body:textJSON(geo)}));
 await page.route('https://api.openf1.org/v1/**',r=>{
  const endpoint=new URL(r.request().url()).pathname.split('/').at(-1);
  if(endpoint==='location')return r.fulfill({status:429,body:'test: position data limited'});
  const data={drivers,laps,car_data:car}[endpoint]||[];
  return r.fulfill({status:200,contentType:'application/json',body:textJSON(data)});
 });
}
async function smoke(browser,viewport){
 const page=await browser.newPage({viewport});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await prepare(page);
 await page.goto(address,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#track-source')?.textContent?.includes('LICENSED GEO OUTLINE'),null,{timeout:15000});
 const track=page.locator('#track-3d-stage'),button=page.locator('#view-mode');
 // The runner may have no GPU/WebGL2 (CI containers often don't). Verify the real
 // Three.js ESM module is resolvable in either case, then test the appropriate UX.
 const moduleReady=await page.evaluate(async()=>{try{return !!(await import('./track3d.js')).createTrack3D;}catch(e){return String(e);}});
 assert.equal(moduleReady,true,'Three.js with three.core.js must load as a browser ESM module: '+String(moduleReady));
 const webgl2=await page.evaluate(()=>{try{return !!document.createElement('canvas').getContext('webgl2');}catch{return false;}});
 if(viewport.width<760 && webgl2)await button.click();
 if(webgl2){
   try{await page.waitForFunction(()=>document.querySelector('#track-3d-stage canvas')&&document.querySelector('#view-mode').getAttribute('aria-pressed')==='true',null,{timeout:10000});}
   catch(e){console.log('3D state',await page.evaluate(()=>({status:document.querySelector('#status-text')?.textContent,source:document.querySelector('#track-source')?.textContent,button:document.querySelector('#view-mode')?.textContent})),errors);throw e;}
   assert.equal(await track.evaluate(el=>getComputedStyle(el).display!=='none'),true,'3D stage must be visible');
   assert.equal(await page.locator('#track-overlay').evaluate(el=>getComputedStyle(el).display==='none'),true,'overlay must not block 3D');
   assert.equal(await page.locator('#track').evaluate(el=>getComputedStyle(el).display==='none'),true,'2D canvas must be hidden in 3D view');
   assert.match(await page.locator('.track3d-caption').innerText(),/LICENSED GEO CIRCUIT/);
   await page.locator('#reset-camera').click();
   await button.click();
   assert.equal(await page.locator('#track').evaluate(el=>getComputedStyle(el).display!=='none'),true,'2D canvas restores');
   assert.equal(await track.evaluate(el=>getComputedStyle(el).display==='none'),true,'3D stage hides');
   await button.click();
   await page.waitForFunction(()=>document.querySelector('#track-3d-stage canvas')&&document.querySelector('#view-mode').getAttribute('aria-pressed')==='true',null,{timeout:10000});
 }else{
   await page.waitForFunction(()=>document.querySelector('#view-mode')?.disabled===true,null,{timeout:8000});
   assert.equal(await page.locator('#track').evaluate(el=>getComputedStyle(el).display!=='none'),true,'2D circuit remains available without WebGL2');
   assert.equal(await track.evaluate(el=>getComputedStyle(el).display==='none'),true,'3D stage must remain hidden without WebGL2');
   console.log('WebGL2 unavailable on CI browser; verified Three.js imports and visible 2D fallback');
 }
 await page.locator('#load').click();
 await page.waitForFunction(()=>document.querySelector('#driver-chooser')?.hidden===false,{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#play')?.disabled===false,{timeout:20000});
 assert.match(await page.locator('#track-provenance').innerText(),/MIT GEO OUTLINE/);
 assert.equal(await page.locator('#view-mode').isDisabled(),!webgl2,'Location HTTP 429 must not disable 3D when WebGL2 exists; otherwise 2D fallback applies');
 assert.equal(await page.locator('#chart-a').getAttribute('d')!=='',true,'actual speed trace must render');
 assert.equal(await page.locator('#chart-b').getAttribute('d')!=='',true,'comparison trace must render');
 assert.equal(errors.length,0,'unexpected JavaScript errors: '+errors.join('\n'));
 console.log('PASS browser UI, 429 circuit fallback, ESM import, GPU-aware 3D/2D behavior, driver selection and traces @'+viewport.width);
 await page.close();
}
(async()=>{
 const server=spawn('python3',['-m','http.server',String(port),'--directory','web'],{stdio:'ignore'});
 try {
  await new Promise(r=>setTimeout(r,1200));
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--no-sandbox']});
  try{await smoke(browser,{width:1440,height:960});await smoke(browser,{width:390,height:844});}
  finally{await browser.close();}
 }finally{server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});