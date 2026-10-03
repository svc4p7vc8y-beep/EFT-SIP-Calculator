import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { saunaLines } from '../src/react/calculations/sauna-model.js';
import { enableAutoSauna } from '../src/react/calculations/sauna-auto.js';

const makeRoom=sauna=>({floor:1,id:'steam',name:'Парная',wallArea:10,ceilingArea:6,area:6,perimeter:10,saunaGeometry:{height:2.5,ridgeHeight:1.8},settings:{sauna}});
const item=(lines,id)=>lines.find(line=>line.catalogId===id);

test('new sauna door and linden window are opt-in, supplier-priced, marked up once and editable per room',()=>{
  const sauna=enableAutoSauna();
  assert.equal(item(saunaLines(makeRoom(sauna)),'MAT-SAUNA-GLASSDOOR'),undefined);
  assert.equal(item(saunaLines(makeRoom(sauna)),'MAT-SAUNA-LINDENWINDOW'),undefined);
  sauna.quantities={glassDoor:1,lindenWindow:1};
  const lines=saunaLines(makeRoom(sauna));
  assert.equal(item(lines,'MAT-SAUNA-GLASSDOOR').projectPrice,14462);
  assert.equal(item(lines,'MAT-SAUNA-LINDENWINDOW').projectPrice,3500);
  assert.equal(item(lines,'MAT-SAUNA-GLASSDOOR').priceMultiplier,1.25);
  assert.equal(item(lines,'MAT-SAUNA-LINDENWINDOW').priceMultiplier,1.25);
  sauna.prices={glassDoor:10000,lindenWindow:0};
  const edited=saunaLines(makeRoom(sauna));
  assert.equal(item(edited,'MAT-SAUNA-GLASSDOOR').projectPrice,10000);
  assert.equal(item(edited,'MAT-SAUNA-LINDENWINDOW').projectPrice,0);
  const legacy={enabled:true,quantities:{glassDoor:1,lindenWindow:1}};
  assert.equal(item(saunaLines(makeRoom(legacy)),'MAT-SAUNA-GLASSDOOR').projectPrice,14462);
  assert.equal(item(saunaLines(makeRoom(legacy)),'MAT-SAUNA-LINDENWINDOW').priceMultiplier,1.25);
});

test('saved sauna choices survive migration and arrive in the estimate without changing the plan',()=>{
  const project=createDefaultProject();
  project.services.internalFinish=true;
  project.plan.house={w:3,h:2};
  project.plan.rooms=[{id:'steam',name:'Парная',x:0,y:0,w:3,h:2}];
  project.plan.openings=[];
  project.settings.internal.roomFinishes={'1:steam':{sauna:enableAutoSauna({quantities:{glassDoor:1,lindenWindow:1}})}};
  const oldOpenings=JSON.stringify(project.plan.openings);
  const migrated=migrateProject(JSON.parse(JSON.stringify(project)));
  const lines=calculateProject(migrated).sections.find(section=>section.key==='internal').lines;
  assert.equal(item(lines,'MAT-SAUNA-GLASSDOOR').price,18077.5);
  assert.equal(item(lines,'MAT-SAUNA-LINDENWINDOW').price,4375);
  assert.equal(JSON.stringify(migrated.plan.openings),oldOpenings);
  assert.equal(migrated.plan.rooms[0].w,3);
  assert.equal(migrated.plan.rooms[0].h,2);
  assert.equal(migrated.settings.internal.roomFinishes['1:steam'].sauna.quantities.glassDoor,1);
  assert.equal(migrated.priceMat.find(row=>row.id==='MAT-SAUNA-GLASSDOOR').price,14462);
});
