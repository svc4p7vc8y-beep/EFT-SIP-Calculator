import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {buildClientEstimate} from '../src/react/calculations/client-estimate.js';

const internal=p=>calculateProject(p).sections.find(section=>section.key==='internal')?.lines||[];
const amount=lines=>lines.reduce((sum,line)=>sum+line.qty*line.price,0);

test('detailed interior finishes an empty house floor and ceiling by full contour area',()=>{
  const p=createDefaultProject();p.plan.house={w:8,h:6};p.plan.rooms=[];p.plan.openings=[];p.services.internalFinish=true;
  const c=calculateProject(p);
  assert.equal(c.internal.mode,'rooms');assert.equal(c.internal.rooms.length,1);
  assert.equal(c.internal.totals.floorArea,48);assert.equal(c.internal.totals.ceilingArea,48);
  assert.ok(internal(p).some(line=>line.catalogId==='MAT-111'));
  assert.ok(internal(p).some(line=>line.catalogId==='MAT-110'));
});

test('wet-room tile assembly includes GVLW, waterproofing, glue, grout and labor',()=>{
  const p=createDefaultProject();p.plan.rooms=[{id:'bath',name:'Санузел',x:0,y:0,w:3,h:2,include:true}];p.plan.house={w:3,h:2};p.plan.openings=[];p.services.internalFinish=true;
  const ids=new Set(internal(p).map(line=>line.catalogId));
  for(const id of ['MAT-207','MAT-103','MAT-109','MAT-115','MAT-106','MAT-104','LAB-057','LAB-062'])assert.ok(ids.has(id),id);
  assert.ok(internal(p).every(line=>line.catalogId&&line.price>0));
});

test('room override switches walls to insulated metal-frame drywall with paint',()=>{
  const p=createDefaultProject();p.plan.rooms=[{id:'bed',name:'Спальня 1',x:0,y:0,w:4,h:3,include:true}];p.plan.house={w:4,h:3};p.plan.openings=[];p.services.internalFinish=true;
  p.settings.internal.roomFinishes['1:bed']={wallsFinish:'drywall',wallFrame:'metal',wallInsulation:true,drywallType:'standard',drywallLayers:2,wallFinal:'paint',wallPaintCoats:2};
  const ids=new Set(internal(p).map(line=>line.catalogId));
  for(const id of ['MAT-211','MAT-212','MAT-222','MAT-208','MAT-221','MAT-219','MAT-220','MAT-224','LAB-114','LAB-115','LAB-117','LAB-129'])assert.ok(ids.has(id),id);
});

test('second floor has independent room settings and the staircase opening reduces both finish floors',()=>{
  const p=createDefaultProject();p.services.internalFinish=true;p.meta.floors=2;
  p.upperFloors=[structuredClone(p.plan)];p.upperFloors[0].floorOpening={x:1,y:1,width:2,length:3};
  const c=calculateProject(p),first=c.internal.rooms.filter(room=>room.floor===1).reduce((sum,room)=>sum+room.area,0),second=c.internal.rooms.filter(room=>room.floor===2).reduce((sum,room)=>sum+room.area,0);
  assert.equal(Math.round((c.metrics.floorArea-6)*100)/100,Math.round(first*100)/100);
  assert.equal(Math.round((c.metrics.floorPlans[1].metrics.floorArea-6)*100)/100,Math.round(second*100)/100);
  assert.ok(c.internal.rooms.some(room=>room.floor===2));
});

test('legacy projects keep legacy totals while version 116 room settings survive migration',()=>{
  const source=createDefaultProject();source.services.internalFinish=true;
  const legacy=migrateProject({...source,appVersion:115,settings:{...source.settings,internal:{wallArea:10,ceilingArea:9,laminateArea:8,tileArea:2,doors:1}}});
  assert.equal(legacy.settings.internal.mode,'legacy');assert.equal(calculateProject(legacy).internal.mode,'legacy');
  source.settings.internal.roomFinishes['1:room-1']={floorFinish:'tile',floorSubstrate:'gvl20'};
  const restored=migrateProject(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.settings.internal.roomFinishes['1:room-1'].floorFinish,'tile');
});

test('maximum compact client interior preserves total and reduces row count',()=>{
  const p=createDefaultProject();p.services.internalFinish=true;const c=calculateProject(p);
  const detailed=c.sections.find(section=>section.key==='internal');
  const compact=buildClientEstimate(c,{maximumCompact:true}).sections.find(section=>section.key==='internal');
  assert.ok(compact.lines.length<detailed.lines.length);
  assert.ok(Math.abs(amount(compact.lines)-amount(detailed.lines))<.01);
  assert.ok(compact.lines.some(line=>line.name.includes('сопутствующих материалов')));
});
