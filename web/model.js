/* RaceVector inference. Only actual 2024 OpenF1-trained ONNX weights are used.
   Model predicts km/h two seconds after a 6-second causal input window.
   The 32 channels are the final TCN hidden state, not causal feature explanations. */
(() => {
  'use strict';
  const STEP=0.5, WINDOW=12, HORIZON=4;
  const FEATURES=['speed','throttle','brake','gear','rpm'];
  const SCALES=[380,100,1,8,16000];
  const state={status:'INITIALIZING',session:null,evaluation:null,error:null};
  const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function initialize(){
    if(state.status==='READY')return state;
    state.status='LOADING';
    try {
      const response=await fetch('./models/evaluation.json',{cache:'no-cache'});
      if(!response.ok)throw Error('Evaluated model metadata has not been deployed');
      const evalData=await response.json();
      if(evalData.source!=='OpenF1 historical API'||evalData.window_samples!==WINDOW||evalData.horizon_seconds!==2||FEATURES.join(',')!==(evalData.features||[]).join(','))throw Error('Model preprocessing metadata mismatch');
      if(!window.ort?.InferenceSession)throw Error('ONNX WebAssembly runtime unavailable');
      // Hosted on our own GitHub Pages origin to avoid third-party WASM runtime fetches.
      window.ort.env.wasm.wasmPaths='./vendor/ort/';
      window.ort.env.wasm.numThreads=1;
      state.session=await window.ort.InferenceSession.create('./models/racevector.onnx',{executionProviders:['wasm']});
      const names=state.session.outputNames||[];
      if(!names.includes('speed_prediction')||!names.includes('latent_activations'))throw Error('Trained ONNX model is missing required outputs');
      state.evaluation=evalData;state.status='READY';state.error=null;
    }catch(error){state.status='UNAVAILABLE';state.error=error.message;console.warn('RaceVector model:',error);}
    return state;
  }
  function windowsForLap(lap){
    const car=[...(lap.car||[])].sort((a,b)=>a.t-b.t);
    const chunks=[];let current=[];
    for(const sample of car){
      if(current.length&&sample.t-current[current.length-1].t>1.5){chunks.push(current);current=[];}
      current.push(sample);
    }
    if(current.length)chunks.push(current);
    const samples=[],targets=[],actuals=[];
    for(const segment of chunks){
      if(segment.length<WINDOW+HORIZON)continue;
      const start=segment[0].t,end=segment[segment.length-1].t;
      const count=Math.floor((end-start-0.000001)/STEP)+1;
      if(count<WINDOW+HORIZON)continue;
      let i=0;const grid=[];
      for(let n=0;n<count;n++){
        const t=start+n*STEP;
        while(i+1<segment.length&&segment[i+1].t<t)i++;
        const a=segment[i],b=segment[Math.min(i+1,segment.length-1)];
        if(FEATURES.some(k=>!Number.isFinite(Number(a[k]))||!Number.isFinite(Number(b[k])))){grid.push(null);continue;}
        const ratio=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t||1)));
        grid.push(FEATURES.map((key,f)=> (Number(a[key])+(Number(b[key])-Number(a[key]))*ratio)/SCALES[f]));
      }
      for(let endIndex=WINDOW-1;endIndex<grid.length-HORIZON;endIndex++){
        const frame=grid.slice(endIndex-WINDOW+1,endIndex+1),actual=grid[endIndex+HORIZON];
        if(!actual||frame.some(x=>!x))continue;
        samples.push(...frame.flat());
        targets.push(start+(endIndex+HORIZON)*STEP);
        actuals.push(actual[0]*380);
      }
    }
    return {samples:new Float32Array(samples),targets,actuals};
  }
  async function infer(lap){
    if(state.status!=='READY')return [];
    const input=windowsForLap(lap),rows=input.targets.length;
    if(!rows)return [];
    const out=[];const BATCH=192;
    for(let offset=0;offset<rows;offset+=BATCH){
      const n=Math.min(BATCH,rows-offset);
      const tensor=new window.ort.Tensor('float32',input.samples.subarray(offset*WINDOW*5,(offset+n)*WINDOW*5),[n,WINDOW,5]);
      const outputs=await state.session.run({telemetry_window:tensor});
      const speeds=outputs.speed_prediction?.data;
      const activations=outputs.latent_activations?.data;
      if(!speeds||!activations||activations.length!==n*32)throw Error('Unexpected ONNX output shape');
      for(let j=0;j<n;j++){
        const forecast=Number(speeds[j])*380,targetTime=input.targets[offset+j];
        if(!Number.isFinite(forecast))continue;
        out.push({t:targetTime,predicted:forecast,actual:input.actuals[offset+j],
          latent:Array.from(activations.subarray(j*32,(j+1)*32))});
      }
      if(offset+BATCH<rows)await sleep();
    }
    return out;
  }
  window.RaceVectorML={state,initialize,infer,windowsForLap};
})();