import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {saunaLines} from '../src/react/calculations/sauna-model.js';

function fixture(settings={}) {
  const p=createDefaultProject();p.services.internalFinish=true;
  p.plan.house={w:3,h:2};p.plan.rooms=[{id:'sauna',name:'Парная',x:0,y:0,w:3,h:2,include:true}];p.plan.openings=[];
  p.settings.internal.roomFinishes['1:sauna']=settings;
  return p;
}
const lines=p=>calculateProject(p).sections.find(s=>s.key==='internal').lines;
test('sauna is opt-in and disabling restores original finishes',()=>{
  const p=fixture();const before=lines(p);
  assert.ok(!before.some(l=>l.catalogId?.includes('SAUNA')));
  p.settings.internal.roomFinishes['1:sauna']={sauna:{enabled:false,heaterType:'wood'}};
  assert.deepEqual(lines(p),before);
});
test('sauna replaces standard wall and ceiling finishes, keeps floor',()=>{
  const p=fixture({wallArea:10,ceilingArea:6,sauna:{enabled:true,heaterType:'electric',heaterModel:'Test',benchLength:2,benchWidth:.6,benchTiers:2}});
  const result=lines(p);
  assert.equal(result.find(l=>l.catalogId==='MAT-SAUNA-LINING').qty,17.6);
  assert.equal(result.find(l=>l.catalogId==='MAT-SAUNA-BENCH').qty,2.4);
  assert.ok(result.find(l=>l.catalogId==='MAT-108'));
  assert.ok(!result.some(l=>['MAT-105','MAT-110','MAT-233'].includes(l.catalogId)));
  assert.ok(result.find(l=>l.catalogId==='MAT-SAUNA-HEATER').name.includes('Test'));
  assert.ok(result.find(l=>l.catalogId==='MAT-SAUNA-HEATER').pricePending);
});
test('room prices override supplier price without mutating catalog, including zero',()=>{
  const p=fixture({sauna:{enabled:true,heaterType:'electric',prices:{heater:12345}}});
  p.priceMat.find(l=>l.id==='MAT-SAUNA-HEATER').price=999;
  assert.equal(lines(p).find(l=>l.catalogId==='MAT-SAUNA-HEATER').price,12345);
  assert.ok(!lines(p).find(l=>l.catalogId==='MAT-SAUNA-HEATER').pricePending);
  assert.equal(p.priceMat.find(l=>l.id==='MAT-SAUNA-HEATER').price,999);
  p.settings.internal.roomFinishes['1:sauna'].sauna.prices.heater=0;
  assert.equal(lines(p).find(l=>l.catalogId==='MAT-SAUNA-HEATER').price,0);
});
test('chimney only for wood heater and quantities cannot become negative',()=>{
  const room={floor:1,id:'a',name:'A',wallArea:10,ceilingArea:0,settings:{sauna:{enabled:true,heaterType:'electric',quantities:{chimney:1,stones:-5}}}};
  assert.ok(!saunaLines(room).some(l=>/CHIMNEY|STONES/.test(l.catalogId)));
  room.settings.sauna.heaterType='wood';assert.ok(saunaLines(room).some(l=>/CHIMNEY/.test(l.catalogId)));
  room.settings.enabled=false;assert.deepEqual(saunaLines(room),[]);
});
test('sauna settings and room prices survive JSON migration',()=>{
  const p=fixture({sauna:{enabled:true,heaterType:'wood',notes:'Рабочий узел',prices:{heater:123}}});
  const restored=migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.settings.internal.roomFinishes,p.settings.internal.roomFinishes);
  assert.deepEqual(lines(restored),lines(p));
});
test('tile completion is opt-in with existing floor consumption rates and separate wall keys',()=>{
  const settings={floorFinish:'none',wallsFinish:'drywall',drywallType:'moisture',wallFinal:'tile',wallArea:10,waterproofWallShare:1,wetZone:true};
  const p=fixture(settings);const before=lines(p);
  assert.ok(!before.some(l=>l.id.includes('tile-completion')));
  settings.tileCompletion=true;settings.tileTapeLength=3;settings.tileSealLength=5;
  const added=lines(p).filter(l=>l.id.includes('tile-completion'));
  assert.equal(added.find(l=>l.catalogId==='MAT-215').qty,1);
  assert.equal(added.find(l=>l.catalogId==='MAT-104').qty,2);
  assert.equal(added.find(l=>l.catalogId==='MAT-109').qty,3.3);
  assert.equal(added.find(l=>l.catalogId==='LAB-126').qty,5);
  assert.ok(lines(p).some(l=>l.catalogId==='MAT-209'));
});
