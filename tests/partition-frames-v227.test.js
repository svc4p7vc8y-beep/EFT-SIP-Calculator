import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
import {partitionFrameMembers} from '../src/react/calculations/partition-cutting.js';
import {framingNormalOffset,framingDepth} from '../src/react/calculations/partition-geometry.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {projectOpeningInserts} from '../src/react/calculations/sip-opening-inserts.js';
import {calculateDeliveryVolume} from '../src/react/calculations/delivery-volume.js';
import {synchronizeWallThickness} from '../src/react/state/wall-thickness.js';
const settings=()=>normalizeProductionCutting({kerfMm:3,endAllowanceMm:0});
const wall=profile=>({id:'П1',width:4000,height:2500,frameProfile:profile,openings:[],startExterior:true});
const base=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],platforms:[],wallGaps:[]});p.settings.productionCutting=settings();return p;};
test('ordinary exterior-connected partition: clear 590 bays, one flat plate, recessed edge and full diagonal stopping before terminal stud',()=>{
 for(const profile of ['50×100','45×145'])for(const side of ['left-right','right-left']){
  const s=wall(profile),[t,d]=profile.split('×').map(Number),m=partitionFrameMembers(s,{...settings(),partitionBraceDirection:side}),studs=m.filter(m=>m.material==='Стойка перегородки');
  for(let i=1;i<studs.length-2;i++)assert.equal(studs[i].a[0]-studs[i-1].a[0]-t,590);
  assert.equal(m.filter(m=>m.material==='Верхняя обвязка перегородки').length,1);
  const brace=m.find(m=>m.role==='brace'),edge=m.find(m=>m.role==='edge-board');assert.ok(brace);assert.equal(brace.profile,'25×150');assert.equal(brace.notchDepthMm,25);assert.equal(edge.profile,profile);assert.equal(edge.notchDepthMm,t);
  for(const member of [edge,brace])assert.equal(framingNormalOffset(member,s)+framingDepth(member)/2,d/2);
  assert.equal(brace.outline.length,4);assert.ok(side==='left-right'?Math.max(...brace.outline.map(p=>p[0]))<=4000-t:Math.min(...brace.outline.map(p=>p[0]))>=t);
  assert.ok(studs.some(s=>s.notches?.some(n=>n.type==='brace'&&n.depthMm===25)));
 }
});
test('internal ordinary partition has edge board, while wall-touching partition has bracing; manual back face remains flush',()=>{
 const s={...wall('50×100'),startExterior:false},m=partitionFrameMembers(s,settings());assert.ok(m.some(m=>m.role==='edge-board'));assert.ok(!m.some(m=>m.role==='brace'));
 const edge=partitionFrameMembers(s,{...settings(),partitionNotchFace:'back'}).find(m=>m.role==='edge-board');assert.equal(framingNormalOffset(edge,s)-framingDepth(edge)/2,-50);
});
test('six opening inserts match production, estimate and delivery; full jambs and light openings preserved',()=>{
 const p=base();p.plan.openings=[{id:'w',type:'window',outer:true,x:1.5,y:0,width:1,height:1.2,sillHeight:.85,orientation:'h'},{id:'d',type:'door',outer:true,x:4.5,y:0,width:.9,height:2.05,orientation:'h'}];
 const before=structuredClone(p),c=calculateProject(p),r=calculateProductionCutting(p,c),inserts=r.members.filter(m=>m.role==='opening-insert'&&!m.excluded),estimated=projectOpeningInserts(p,c.metrics.floorPlans);
 assert.equal(inserts.length,6);assert.deepEqual(inserts.map(m=>[m.key,m.profile,m.length]).sort(),estimated.map(m=>[m.key,m.profile,m.length]).sort());
 assert.equal(inserts.reduce((s,m)=>s+m.length,0),2960);assert.ok(inserts.every(m=>m.profile==='145×45'));
 const line=c.lines.find(l=>l.source==='sip-opening-inserts');assert.equal(line.catalogId,'MAT-006');assert.equal(line.qty,6);assert.equal(line.price,340);
 assert.ok(calculateDeliveryVolume(p,c).categories.find(g=>g.key==='timber').rows.some(l=>l.id===line.id&&Math.abs(l.volume-.03915)<1e-6));
 assert.deepEqual(r.sipJunctionConflicts.filter(c=>c.surfaceId===inserts[0].surfaceId),[]);assert.deepEqual(p,before);
 const m=inserts[0];p.settings.productionCutting.memberOverrides[m.key]={exclude:true,nodeRef:'Рабочий узел'};const saved=migrateProject(JSON.parse(JSON.stringify(p))),after=calculateProductionCutting(saved,calculateProject(saved));assert.ok(after.members.find(v=>v.key===m.key).excluded);assert.equal(projectOpeningInserts(saved,calculateProject(saved).metrics.floorPlans).length,5);
});
test('project opening insert profile uses its catalog unit and full stock quantity',()=>{
 const p=base();p.plan.openings=[{id:'w',type:'window',outer:true,x:1.5,y:0,width:1,height:1.2,sillHeight:.85,orientation:'h'}];
 const first=projectOpeningInserts(p,calculateProject(p).metrics.floorPlans)[0];p.settings.productionCutting.memberOverrides[first.key]={profile:'50×150'};
 const c=calculateProject(p),line=c.lines.find(l=>l.id==='sip:opening-inserts-50×150');
 assert.equal(line.catalogId,'MAT-023');assert.equal(line.unit,'м3');assert.equal(line.qty,.045);
});
test('exterior attachment automatically inserts a panel seam without changing plan; custom plan section retains 145 depth',()=>{
 const p=base();p.plan.walls=[{id:'p',x1:2.2,y1:.174,x2:2.2,y2:3.826}];p.settings.sip.partitionFrameSection='45x145';synchronizeWallThickness(p,'partitionFrameSection');assert.equal(p.plan.partitionThickness,.145);
 const before=structuredClone(p.plan),c=calculateProject(p),r=calculateProductionCutting(p,c);assert.deepEqual(p.plan,before);
 const exterior=r.surfaces.find(s=>s.exterior&&s.partitionSeams?.includes(2200));assert.ok(exterior);assert.ok(!r.parts.some(v=>v.surfaceId===exterior.id&&v.x<2200-.1&&v.x+v.width>2200+.1));
 assert.ok(r.members.some(m=>m.role==='brace'&&m.surfaceId.includes('ПГ')));assert.ok(c.lines.some(l=>l.source==='partition-detail'&&l.catalogId==='MAT-006'&&l.unit==='м.п.'));
});
test('saved spacing, alignment switch and notch depths survive reopening; absent values receive new defaults',()=>{
 const p=base();Object.assign(p.settings.productionCutting,{partitionClearGapMm:550,partitionSipAlignment:false,partitionBraceNotchDepthMm:20,bearingEdgeNotchDepthMm:30});const q=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(q.settings.productionCutting.partitionClearGapMm,550);assert.equal(q.settings.productionCutting.partitionSipAlignment,false);assert.equal(q.settings.productionCutting.partitionBraceNotchDepthMm,20);
 assert.equal(settings().partitionClearGapMm,590);assert.equal(settings().partitionSipAlignment,true);
});
