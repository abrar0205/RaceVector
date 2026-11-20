/* Circuit outlines from bacinger/f1-circuits (MIT, copyright Tomislav Bacinger).
   These are geographic circuit outlines, NOT OpenF1 car positions or speed traces.
   The copy of the source license is distributed alongside /data/circuits.geojson. */
(() => {
  'use strict';
  let sourcePromise;
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {
    'monte carlo':'circuit de monaco','monaco':'circuit de monaco',
    'monza':'autodromo nazionale monza','italy':'autodromo nazionale monza',
    'imola':'autodromo enzo e dino ferrari','emilia romagna':'autodromo enzo e dino ferrari',
    'spa francorchamps':'circuit de spa francorchamps','belgium':'circuit de spa francorchamps',
    'silverstone':'silverstone circuit','great britain':'silverstone circuit',
    'suzuka':'suzuka international racing course','japan':'suzuka international racing course',
    'sakhir':'bahrain international circuit','bahrain':'bahrain international circuit',
    'marina bay':'marina bay street circuit','singapore':'marina bay street circuit',
    'yas island':'yas marina circuit','abu dhabi':'yas marina circuit',
    'austin':'circuit of the americas','united states':'circuit of the americas',
    'las vegas':'las vegas street circuit',
    'miami':'miami international autodrome',
    'baku':'baku city circuit','azerbaijan':'baku city circuit',
    'interlagos':'autodromo jose carlos pace interlagos','sao paulo':'autodromo jose carlos pace interlagos',
    'spielberg':'red bull ring','austria':'red bull ring',
    'zandvoort':'circuit zandvoort','netherlands':'circuit zandvoort',
    'barcelona':'circuit de barcelona catalunya','spain':'circuit de barcelona catalunya',
    'montreal':'circuit gilles villeneuve','canada':'circuit gilles villeneuve',
    'hungaroring':'hungaroring','hungary':'hungaroring',
    'jeddah':'jeddah corniche circuit','saudi arabia':'jeddah corniche circuit',
    'shanghai':'shanghai international circuit','china':'shanghai international circuit',
    'lusail':'losail international circuit','qatar':'losail international circuit',
    'melbourne':'albert park circuit','australia':'albert park circuit',
    'madrid':'circuito de madring',
    'mexico city':'autodromo hermanos rodriguez','mexico':'autodromo hermanos rodriguez',
    'budapest':'hungaroring'
  };
  function pick(features, meeting) {
    if (!meeting || !Array.isArray(features)) return null;
    const circuit=normalize(meeting.circuit_short_name);
    const venue=normalize(meeting.meeting_name);
    const country=normalize(meeting.country_name);
    const keys=[circuit,venue,country].filter(Boolean);
    const candidates = keys.map((key,i)=>({value:aliases[key]||key,weight:300-i*100}));
    let winner=null,score=0;
    for (const feature of features) {
      const name=normalize(feature?.properties?.Name);
      const city=normalize(feature?.properties?.Location);
      if (!name || feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length<4) continue;
      let points=0;
      for (const candidate of candidates) {
        if (candidate.value===name) points=Math.max(points,candidate.weight+100);
        else if (candidate.value===city && city.length>3) points=Math.max(points,candidate.weight+80);
        else if (candidate.value.length>4 && name.includes(candidate.value)) points=Math.max(points,candidate.weight+50);
      }
      if (points>score) {winner=feature;score=points;}
    }
    return winner;
  }
  async function load(){
    if(!sourcePromise){
      sourcePromise=fetch('./data/circuits.geojson').then(async r=>{
        if(!r.ok)throw Error('Licensed circuit outlines are unavailable');
        const data=await r.json();
        if(data.type!=='FeatureCollection' || !Array.isArray(data.features))throw Error('Invalid circuit geometry');
        return data.features;
      }).catch(error=>{sourcePromise=null;throw error;});
    }
    return sourcePromise;
  }
  function points(feature){
    if(!feature?.geometry?.coordinates?.length)return [];
    const coords=feature.geometry.coordinates.filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
    if(coords.length<4)return [];
    const lat=coords.reduce((acc,p)=>acc+p[1],0)/coords.length;
    const scale=Math.cos(lat*Math.PI/180);
    return coords.map(([lon,lat])=>({x:lon*scale,y:lat}));
  }
  window.RaceVectorCircuits={load,pick,points,normalize};
})();