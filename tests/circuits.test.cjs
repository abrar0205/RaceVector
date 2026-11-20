/* Unit fixtures are deliberately synthetic and used only in CI, never deployed. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('web/circuits.js','utf8');
const env={window:{}};vm.runInNewContext(code,env);
const api=env.window.RaceVectorCircuits;
const features=[
 {type:'Feature',properties:{Name:'Circuit de Monaco',Location:'Monaco'},geometry:{type:'LineString',coordinates:[[7.1,43.1],[7.3,43.2],[7.4,43.3],[7.1,43.1]]}},
 {type:'Feature',properties:{Name:'Autodromo Nazionale Monza',Location:'Monza'},geometry:{type:'LineString',coordinates:[[9.2,45.6],[9.3,45.6],[9.3,45.7],[9.2,45.6]]}},
 {type:'Feature',properties:{Name:'Autodromo Enzo e Dino Ferrari',Location:'Imola'},geometry:{type:'LineString',coordinates:[[11.7,44.3],[11.8,44.3],[11.8,44.4],[11.7,44.3]]}},
 {type:'Feature',properties:{Name:'Silverstone Circuit',Location:'Silverstone'},geometry:{type:'LineString',coordinates:[[-1.0,52],[-1.1,52.01],[-1.12,52.03],[-1.0,52]]}},
 {type:'Feature',properties:{Name:'Las Vegas Street Circuit',Location:'Las Vegas'},geometry:{type:'LineString',coordinates:[[-115.17,36.1],[-115.17,36.11],[-115.18,36.11],[-115.17,36.1]]}}
];
test('Monaco alias maps to real circuit name',()=>assert.equal(api.pick(features,{circuit_short_name:'Monte Carlo',meeting_name:'Monaco Grand Prix'}).properties.Name,'Circuit de Monaco'));
test('Great Britain maps to Silverstone',()=>assert.equal(api.pick(features,{country_name:'Great Britain',circuit_short_name:'Silverstone'}).properties.Name,'Silverstone Circuit'));
test('Las Vegas maps without ambiguous US match',()=>assert.equal(api.pick(features,{country_name:'United States',circuit_short_name:'Las Vegas'}).properties.Name,'Las Vegas Street Circuit'));
test('unknown meeting does not render a fabricated track',()=>assert.equal(api.pick(features,{circuit_short_name:'Imaginary GP'}),null));
test('geographic longitude scaled for latitude and no lap timestamps are invented',()=>{
 const points=api.points(features[0]);assert.equal(points.length,4);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&!('t' in p)));
});

test('circuit-specific venue wins over country alias (Imola vs Monza)',()=>assert.equal(api.pick(features,{circuit_short_name:'Imola',country_name:'Italy'}).properties.Name,'Autodromo Enzo e Dino Ferrari'));