import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {saunaLines} from '../src/react/calculations/sauna-model.js';
import {chimneySchedule,liningOptions,saunaIncomplete} from '../src/react/calculations/sauna-details.js';
const room=s=>({floor:1,id:'a',name:'Парная',wallArea:10,ceilingArea:6,settings:{sauna:{enabled:true,detailVersion:1,...s}}});
const find=(lines,key)=>lines.find(l=>l.catalogId.endsWith(`-${key.toUpperCase()}`));
const dimensions={ceilingHeight:2.5,roofRise:1.8,aboveRoof:.7,inletHeight:.64,singleEffective:.95,sandwichEffective:.45,fittingsEffective:.3,passages:1};
test('detailed labor uses net wall and ceiling area, not floor or reserve',()=>{
  const r=room({heaterType:'wood',quantities:{installation:1}});r.settings.floorArea=500;
  const lines=saunaLines(r,1.2);
  assert.equal(find(lines,'liningWork').qty,16);assert.equal(find(lines,'liningWork').projectPrice,18000);
  assert.equal(find(lines,'liningWork').priceMultiplier,1);assert.equal(find(lines,'lining').qty,19.2);
  assert.ok(!find(lines,'installation'));
  assert.equal(find(lines,'heaterDelivery').projectPrice,7000);assert.equal(find(lines,'heaterDelivery').priceMultiplier,1);
  assert.equal(find(lines,'heaterWork').projectPrice,15000);
});
test('markup reaches estimate once, zero/manual prices and old projects are preserved',()=>{
  const p=createDefaultProject();p.services.internalFinish=true;
  p.plan.house={w:3,h:2};p.plan.rooms=[{id:'a',name:'Парная',x:0,y:0,w:3,h:2}];p.plan.openings=[];
  p.settings.internal.roomFinishes['1:a']={wallArea:10,ceilingArea:6,sauna:{enabled:true,detailVersion:1,heaterType:'wood',prices:{heater:42010}}};
  const lines=()=>calculateProject(p).sections.find(s=>s.key==='internal').lines;
  assert.equal(find(lines(),'heater').price,52512.5);assert.equal(find(lines(),'heaterDelivery').price,7000);
  assert.equal(find(lines(),'liningWork').price,18000);
  p.priceLab.find(l=>l.id==='LAB-SAUNA-LININGWORK').price=17000;
  assert.equal(find(lines(),'liningWork').price,17000);
  assert.equal(p.priceMat.find(l=>l.id==='MAT-SAUNA-HEATER').price,0);
  assert.deepEqual(calculateProject(migrateProject(JSON.parse(JSON.stringify(p)))).sections,calculateProject(p).sections);
  p.settings.internal.roomFinishes['1:a'].sauna.prices.heater=0;
  assert.equal(find(lines(),'heater').price,0);assert.equal(find(lines(),'heater').pricePending,true);
  p.settings.internal.roomFinishes['1:a'].sauna.detailVersion=0;
  assert.ok(!find(lines(),'liningWork'));assert.ok(!find(lines(),'heaterDelivery'));
});
test('frame area parameters and stock packaging do not double count',()=>{
  const lines=saunaLines(room({frameMode:'area',insulationThickness:50,battenStep:.5,counterStep:.4,stockMaterials:true,quantities:{tape:31}}));
  assert.ok(Math.abs(find(lines,'insulation').qty-.88)<1e-10);
  assert.equal(find(lines,'battenStock').qty,12);assert.equal(find(lines,'counterStock').qty,15);
  assert.equal(find(lines,'foilRoll').qty,2);assert.equal(find(lines,'tapeRoll').qty,2);
  for(const k of ['batten','counterBatten','foil','tape'])assert.ok(!find(lines,k));
});
test('lining stock uses working width and kerf, whole packs, offers ranked by waste',()=>{
  assert.deepEqual(liningOptions(10,{}),[]);
  assert.deepEqual(liningOptions(10,{workingWidth:970,cutLength:2}),[]);
  const options=liningOptions(1.76,{workingWidth:88,cutLength:1,kerf:3},1);
  const two=options.find(o=>o.length===2);assert.equal(two.perBoard,1);assert.equal(two.packs,2);
  const exact=liningOptions(1.76,{workingWidth:88,cutLength:1,kerf:0},1).find(o=>o.length===2);
  assert.equal(exact.perBoard,2);assert.equal(exact.packs,1);
  assert.ok(options.every((o,i)=>!i||o.waste>=options[i-1].waste));
  const lines=saunaLines(room({liningMode:'packs',liningStock:{workingWidth:88,cutLength:2.4,length:2.5}}));
  assert.ok(find(lines,'liningPack'));assert.ok(!find(lines,'lining'));
});
test('chimney uses effective lengths, validates geometry and never leaks to electric mode',()=>{
  const c=chimneySchedule(dimensions);
  assert.equal(c.valid,true);assert.ok(Math.abs(c.length-4.36)<1e-9);
  assert.equal(c.quantities.chimneySandwich,7);assert.ok(c.purchased>=c.length);
  assert.equal(chimneySchedule({}).valid,false);
  assert.equal(chimneySchedule({...dimensions,inletHeight:2.4}).valid,false);
  assert.equal(chimneySchedule({...dimensions,sandwichEffective:-1}).valid,false);
  assert.equal(chimneySchedule({...dimensions,sandwichEffective:1}).valid,false);
  const s={heaterType:'wood',chimneyMode:'parts',chimneyDimensions:dimensions,quantities:{chimney:1}};
  const lines=saunaLines(room(s));assert.ok(!find(lines,'chimney'));assert.equal(find(lines,'chimneySandwich').qty,7);
  assert.ok(!saunaLines(room({...s,heaterType:'electric'})).some(l=>l.catalogId.includes('CHIMNEY')));
  assert.ok(!find(saunaLines(room({...s,heaterType:'none'})),'heaterDelivery'));
});
test('incomplete assemblies are explicit and available to estimate and export',()=>{
  const r=room({liningMode:'packs',frameMode:'area',heaterType:'wood',chimneyMode:'parts'});
  assert.equal(saunaIncomplete(r).length,4);
  r.settings.sauna.detailVersion=0;assert.deepEqual(saunaIncomplete(r),[]);
});
test('disabling detailed settings retains the original manual assembly',()=>{
  const r=room({detailVersion:0,quantities:{installation:1,batten:23,plinth:12},prices:{lining:100}});
  const lines=saunaLines(r);assert.equal(find(lines,'installation').qty,1);assert.equal(find(lines,'batten').qty,23);
  assert.equal(find(lines,'lining').priceMultiplier,1);assert.ok(!find(lines,'plinth'));
});
