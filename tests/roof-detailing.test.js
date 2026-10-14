import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {generateRoofSupportLayout,mergeRoofSupportLayout} from '../src/react/calculations/auto-roof-supports.js';
import {roofDetailing} from '../src/react/calculations/roof-detailing.js';
import {productionScene} from '../src/react/calculations/production-scene.js';

const run=project=>calculateProductionCutting(project,calculateProject(project));
const project=()=>{const p=createDefaultProject();p.plan.house={w:8,h:6};p.plan.rooms=[];p.plan.openings=[];p.plan.platforms=[];p.settings.productionCutting.roofDesign.enabled=true;return p;};

for(const shape of ['gable','hip','tiered','flat'])test(`${shape}: one roof revision indexes 3D faces and facet details`,()=>{
  const p=project();p.settings.roof.shape=shape;if(shape==='flat'){p.settings.roof.flatSlopeMode='structural';p.settings.roof.flatSlopePercent=5;}
  const report=run(p),detail=roofDetailing(report),scene=productionScene(report,p);
  assert.equal(detail.revision,report.revision);
  assert.deepEqual(detail.faces.map(f=>f.id),report.assembly.roofModel.faces.map(f=>f.id));
  for(const face of detail.faces){assert.ok(face.edges.length);assert.ok(scene.panels.some(item=>item.faceId===face.id||item.id===face.id));}
});

for(const shape of ['hip','gable'])test(`L-shaped ${shape}: every proposed purlin belongs to a saved facet`,()=>{
  const p=project();p.plan.house={w:10,h:8,points:[[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]].map(([x,y])=>({x,y}))};p.settings.roof.shape=shape;p.settings.roof.eaveOverhang=0;p.settings.roof.gableOverhang=0;
  const report=run(p),proposal=generateRoofSupportLayout(p,report,{variant:'single'});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.counts.purlins>0);
  const faceIds=new Set(report.assembly.roofModel.faces.map(f=>f.id));
  assert.ok(proposal.items.every(item=>faceIds.has(item.faceId)));
  assert.ok(proposal.items.filter(item=>item.type==='post').every(item=>item.startSupport===''));
});

for(const mode of ['none','tapered','structural'])test(`flat ${mode}: supports follow the structural plane without changing estimate`,()=>{
  const p=project();p.settings.roof.shape='flat';p.settings.roof.flatSlopeMode=mode;p.settings.roof.flatSlopePercent=5;
  const calculation=calculateProject(p),report=calculateProductionCutting(p,calculation),proposal=generateRoofSupportLayout(p,report,{});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.items.length);
  const purlins=proposal.items.filter(item=>item.type==='purlin');
  assert.ok(purlins.every(item=>item.roofSourceKey&&item.estimateEnabled===false));
  if(mode==='tapered')assert.ok(purlins.every(item=>item.z1===item.z2));
  assert.deepEqual(calculateProject(p).totals,calculation.totals);
});

for(const kind of ['terrace','porch'])for(const shape of ['shed','gable','continuation'])test(`${kind} ${shape}: platform purlins are distinct and survive JSON`,()=>{
  const p=project();p.plan.platforms=[{id:'platform-1',kind,x:1,y:6,w:4,h:2,roof:{mode:'cold',shape}}];
  const report=run(p),proposal=generateRoofSupportLayout(p,report,{variant:'single'});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.items.some(item=>item.faceId?.startsWith('КП-')));
  const mainOnly=generateRoofSupportLayout(p,report,{variant:'single',includePlatforms:false});
  assert.deepEqual(mainOnly.errors,[]);assert.ok(mainOnly.items.every(item=>!item.faceId?.startsWith('КП-')));
  const saved=structuredClone(p);saved.settings.productionCutting.roofSupports=proposal.items;
  const restored=migrateProject(JSON.parse(JSON.stringify(saved))),next=run(restored),scene=productionScene(next,restored);
  assert.equal(next.assembly.supports.length,proposal.items.length);
  assert.ok(scene.beams.some(item=>item.faceId?.startsWith('КП-')));
  assert.deepEqual(mergeRoofSupportLayout(proposal.items,proposal.items),proposal.items);
});

test('truss setting proposes visible reference geometry without material or a false approval',()=>{
  const p=project();p.settings.roof.structureMode='manual';p.settings.roof.rafterSystem='truss';
  const report=run(p),proposal=generateRoofSupportLayout(p,report,{});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.counts.trusses>1);
  assert.ok(proposal.items.every(item=>item.referenceOnly&&item.trussTemplate&&!item.estimateEnabled));
  const first=proposal.items.filter(item=>item.trussId==='roof-truss-1');
  assert.equal(first.length,9);
  assert.deepEqual(new Set(first.map(item=>item.trussRole)),new Set(['upperChord','lowerChord','web']));
  assert.ok(first.filter(item=>item.trussRole==='web').some(item=>item.nodeStart==='LQ'&&item.nodeEnd==='B'));
  p.settings.productionCutting.roofSupports=proposal.items;
  const next=run(p),scene=productionScene(next,p);
  assert.ok(scene.beams.some(item=>item.layer==='trussTemplates'));
  assert.equal(next.assembly.supports.find(item=>item.id===first[0].id).trussId,'roof-truss-1');
  assert.ok(next.issues.some(issue=>/ферм|Ферм|опор/i.test(issue.message)));
});

for(const shape of ['hip','tiered','flat'])test(`${shape}: truss template is a per-facet reference model`,()=>{
  const p=project();p.settings.roof.shape=shape;p.settings.roof.structureMode='manual';p.settings.roof.rafterSystem='truss';
  if(shape==='flat')p.settings.roof.flatSlopeMode='tapered';
  const report=run(p),proposal=generateRoofSupportLayout(p,report,{});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.counts.trusses>0);
  assert.ok(proposal.items.every(item=>item.referenceOnly&&item.trussTemplate&&item.faceId));
  assert.ok(new Set(proposal.items.map(item=>item.faceId)).size===report.assembly.roofModel.faces.filter(f=>f.group==='main').length);
});

test('truss main roof keeps a separate editable porch template',()=>{
  const p=project();p.settings.roof.structureMode='manual';p.settings.roof.rafterSystem='truss';p.plan.platforms=[{id:'porch',kind:'porch',x:1,y:6,w:3,h:2,roof:{mode:'cold',shape:'gable'}}];
  const proposal=generateRoofSupportLayout(p,run(p),{});
  assert.deepEqual(proposal.errors,[]);assert.ok(proposal.items.some(item=>item.faceId?.startsWith('КП-')));
  assert.ok(proposal.items.every(item=>item.referenceOnly&&!item.estimateEnabled));
});

test('automatic post over an exterior opening is rejected before saving',()=>{
  const p=project();p.plan.openings=[{id:'door',type:'door',x:0,y:3,width:1,height:2,orientation:'v',outer:true}];
  const report=run(p),proposal=generateRoofSupportLayout(p,report,{variant:'single'});
  assert.ok(proposal.errors.some(message=>message.includes('проём')));
  assert.equal(proposal.items.length,0);
});

test('roof change marks saved automatic supports stale while keeping manual edits',()=>{
  const p=project(),first=run(p),proposal=generateRoofSupportLayout(p,first,{variant:'single'});
  p.settings.productionCutting.roofSupports=proposal.items.map((item,i)=>i===0?{...item,autoLocked:true,name:'Мой прогон'}:item);
  p.settings.roof.ridgeHeight+=.2;
  const next=run(p);
  assert.ok(next.assembly.issues.some(message=>message.includes('кровля изменилась')));
  assert.equal(p.settings.productionCutting.roofSupports[0].name,'Мой прогон');
});
