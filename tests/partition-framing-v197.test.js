import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import {partitionFrameMembers} from '../src/react/calculations/partition-cutting.js';
import {boardFootprint,visibleBoardGeometry,refreshPartitionNotches} from '../src/react/calculations/partition-geometry.js';
import {groupMembers,calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {partitionProcurement} from '../src/react/calculations/partition-procurement.js';
import {calculateDeliveryVolume} from '../src/react/calculations/delivery-volume.js';

const settings=()=>normalizeProductionCutting({kerfMm:3,endAllowanceMm:0});
const wall=(bearing=true)=>({id:'Э1-ПГ1',name:'Перегородка',width:3600,height:2500,frameProfile:'50×150',bearing,openings:[]});
const closed=ring=>[...ring,ring[0]];

test('ordinary and bearing walls have one horizontal top plate; only bearing gets the edge board',()=>{
 for(const bearing of [false,true]){const m=partitionFrameMembers(wall(bearing),settings());
  assert.equal(m.filter(m=>m.material==='Верхняя обвязка перегородки').length,1);
  assert.ok(m.filter(m=>m.material==='Стойка перегородки').every(m=>m.b[1]===2450));
  assert.equal(m.filter(m=>m.role==='edge-board').length,bearing?1:0);
  const beam=m.find(m=>m.role==='edge-board');if(beam){assert.equal(beam.profile,'50×150');assert.equal(beam.a[1]+beam.faceWidth/2,2450);}
 }
});

test('bracing has one chosen direction, horizontal cut faces and a stock blank enclosing its full outline',()=>{
 for(const width of [1000,2500,3600,7000])for(const direction of ['auto','left-right','right-left']){
  const m=partitionFrameMembers({...wall(),width},{...settings(),partitionBraceDirection:direction}),braces=m.filter(m=>m.role==='brace');assert.equal(braces.length,1);
  const b=braces[0],shape=boardFootprint(b);assert.equal(b.a[1],2450);assert.equal(b.b[1],50);
  if(direction==='left-right')assert.ok(b.b[0]>b.a[0]);if(direction==='right-left')assert.ok(b.b[0]<b.a[0]);
  assert.ok(shape.every(([x,y])=>x>=0&&x<=width&&y>=50&&y<=2450));
  assert.ok(shape.some((p,i)=>p[1]===2450&&shape[(i+1)%shape.length][1]===2450));
  assert.ok(b.cutLength>=Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1]));
 }
});

test('brace contour never crosses door, window or full-height wall gap; blocked direction is not silently reversed',()=>{
 for(const holes of [
  [{x:150,width:900,height:2100,sill:0}],
  [{x:150,width:900,height:800,sill:850}],
  [{x:150,width:900,height:2500,sill:0,gap:true}],
 ])for(const direction of ['auto','left-right','right-left']){
  const m=partitionFrameMembers({...wall(),width:6000,openings:holes},{...settings(),partitionBraceDirection:direction});
  const braces=m.filter(m=>m.role==='brace');assert.ok(braces.length<=1);
  for(const b of braces)for(const o of holes){const hole=[[o.x,o.sill],[o.x+o.width,o.sill],[o.x+o.width,o.sill+o.height],[o.x,o.sill+o.height],[o.x,o.sill]];
   assert.equal(clipping.intersection([closed(boardFootprint(b))],[hole]).length,0);
  }
  if(direction==='left-right')assert.equal(braces.length,0);
 }
});

test('studs carry actual projected notch outlines; depth is not invented and unequal machining is not grouped',()=>{
 const m=partitionFrameMembers(wall(),settings()),notched=m.filter(m=>m.notches?.some(n=>n.type==='brace'));
 assert.ok(notched.length>=2);assert.ok(notched.every(m=>m.notches.every(n=>n.depthMm==='')));
 assert.ok(notched.every(m=>JSON.stringify(visibleBoardGeometry(m))!==JSON.stringify([[closed(boardFootprint(m))]])));
 const stud=notched[0],different={...stud,id:'other',notches:stud.notches.map(n=>({...n,offsetMm:n.offsetMm+20}))};assert.equal(groupMembers([stud,different]).length,2);
 const same={...stud,id:'same',notches:structuredClone(stud.notches)};assert.equal(groupMembers([stud,same])[0].qty,2);
 const brace=m.find(m=>m.role==='brace');brace.excluded=true;refreshPartitionNotches(m);assert.ok(m.every(m=>!(m.notches||[]).some(n=>n.type==='brace')));
});

test('old standard double plates migrate once; explicit other counts and future manual overrides survive JSON',()=>{
 const raw=createDefaultProject();raw.appVersion=196;raw.settings.formulas.partitionTopPlateLayers=2;
 assert.equal(migrateProject(raw).settings.formulas.partitionTopPlateLayers,1);
 raw.settings.formulas.partitionTopPlateLayers=3;assert.equal(migrateProject(raw).settings.formulas.partitionTopPlateLayers,3);
 raw.appVersion=197;raw.settings.formulas.partitionTopPlateLayers=2;assert.equal(migrateProject(raw).settings.formulas.partitionTopPlateLayers,2);
 const s={...settings(),partitionBraceDirection:'right-left',partitionBraceNotchDepthMm:25,bearingEdgeNotchDepthMm:30};assert.deepEqual(normalizeProductionCutting(JSON.parse(JSON.stringify(s))),s);
});

test('new bearing frame quantities agree in cutting, procurement, estimate and delivery',()=>{
 const p=createDefaultProject();p.plan={...p.plan,house:{w:6,h:4},rooms:[],walls:[{x1:0,y1:2,x2:6,y2:2,bearing:true,bearingProfile:'50x150'}],openings:[],platforms:[]};p.settings.productionCutting=settings();
 const c=calculateProject(p),r=calculateProductionCutting(p,c),boards=partitionProcurement(r).boards;
 const volume=boards.reduce((s,b)=>s+b.volumeM3,0),estimate=c.lines.filter(l=>l.source==='partition-detail').reduce((s,l)=>s+l.qty,0);
 assert.ok(Math.abs(volume-estimate)<.00011);assert.ok(calculateDeliveryVolume(p,c).categories.find(g=>g.key==='timber').autoVolume>=volume);
 const frame=r.members.filter(m=>m.surfaceId?.includes('-ПГ'));assert.equal(frame.filter(m=>m.role==='brace').length,1);assert.equal(frame.filter(m=>m.material==='Верхняя обвязка перегородки').length,1);
});
