import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRuns, planIssues, unifiedWallSegments, nudgePlanSelection, preservePlanAttachments } from '../src/react/planner/geometry.js';
import { convertToWallLayout, rebuildWallRooms, addRoomWalls, wallDepth } from '../src/react/planner/wall-layout.js';
import { partitionSegments, partitionBacking } from '../src/react/calculations/partition-construction.js';
import { calculateClearAreas } from '../src/react/calculations/plan-clear-area.js';
import { calculatePlanMetrics } from '../src/calculations/plan-metrics.js';
import { createDefaultProject, migrateProject, ensureProjectFloorCount } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { connectorSupportCheck, fullSpanBearingCuts } from '../src/react/calculations/ceiling-supports.js';
const fixture=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:4,contourDefined:true},wallHeight:2.5,wallThickness:.174,partitionThickness:.1,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]});return p;};
const wall=(id,x1,y1,x2,y2,extra={})=>({id,x1,y1,x2,y2,...extra});
const length=runs=>runs.reduce((s,[a,b])=>s+Math.hypot(b.x-a.x,b.y-a.y),0);
const report=p=>calculateProductionCutting(p,calculateProject(p));
const room=(id,x,y,w,h)=>({id,name:id,x,y,w,h});
test('near-exterior classification and gaps use the same partition intervals everywhere',()=>{
 const p=fixture();p.plan.rooms=[room('a',.212,.5,1,2)];assert.equal(calculatePlanMetrics(p.plan).partitionLength,6);assert.equal(length(partitionSegments(p.plan)),6);
 p.plan.rooms=[];p.plan.walls=[wall('a',.174,2,3,2),wall('b',3.02,2,5.826,2)];assert.ok(Math.abs(length(partitionRuns(p.plan))-5.632)<1e-8);assert.equal(calculatePlanMetrics(p.plan).partitionLength,5.63);
});
test('reordering nearly shared room edges cannot move the resulting partition',()=>{
 const p=fixture().plan;p.rooms=[room('a',.174,.174,5.652,1.827),room('b',.174,2.004,5.652,1.822)];const before=unifiedWallSegments(p);p.rooms.reverse();assert.deepEqual(unifiedWallSegments(p),before.map(s=>({...s,roomId:s.roomId})));assert.equal(partitionRuns(p)[0][0].y,2.001);
});
test('duplicate and crossing rooms are diagnosed; their occupied area is counted once',()=>{
 const p=fixture().plan;p.rooms=[room('a',1,1,2,2),room('b',1,1,2,2)];assert.ok(planIssues(p).some(i=>i.type==='overlap'));assert.equal(calculatePlanMetrics(p).roomArea,4);
 p.rooms=[room('a',1,1.5,4,1),room('b',2.5,.5,1,3)];assert.ok(planIssues(p).some(i=>i.type==='overlap'));assert.equal(calculatePlanMetrics(p).roomArea,6);
});
test('excluded partitions disappear from quantities, clear area and production',()=>{
 const p=fixture();p.plan.walls=[wall('a',.174,2,5.826,2,{include:false})];assert.equal(calculatePlanMetrics(p.plan).partitionLength,0);assert.equal(partitionSegments(p.plan).length,0);assert.ok(Math.abs(calculateClearAreas(p.plan).clearArea-20.641104)<1e-8);
});
test('26 mm endpoint gaps are visible, actual exterior faces receive backing',()=>{
 const p=fixture().plan;p.rooms=[room('a',.2,.174,5.6,1.826),room('b',.2,2,5.6,1.826)];assert.equal(planIssues(p).filter(i=>i.type==='junction-gap').length,2);
 p.rooms.forEach(r=>{r.x=.174;r.w=5.652;});const [a,b]=partitionSegments(p)[0];assert.deepEqual(partitionBacking(p,a,b),{startBacking:true,endBacking:true});
});
test('room and explicit wall edits preserve door attachment without a second movement',()=>{
 const p=fixture().plan;p.rooms=[room('a',.174,.174,5.652,1.826)];p.openings=[{id:'d',type:'door',outer:false,orientation:'h',x:2,y:2,width:.8,height:2.1}];const before=structuredClone(p);
 nudgePlanSelection(p,{type:'room',id:'a'},0,.3);preservePlanAttachments(p,before);assert.equal(p.openings[0].y,2.3);
 p.rooms=[];p.walls=[wall('w',.174,2.3,5.826,2.3)];nudgePlanSelection(p,{type:'wall',id:'w'},0,.2);assert.equal(p.openings[0].y,2.5);
});
test('local 50x200 frame is consistent with clear area, production and priced timber',()=>{
 const p=fixture();p.plan.walls=[wall('w',.174,2,5.826,2,{bearing:true,bearingProfile:'50x200'})];assert.equal(wallDepth(p.plan,{x:.174,y:2},{x:5.826,y:2}),.2);assert.equal(report(p).surfaces.find(s=>s.partitionFrame).frameProfile,'50×200');assert.ok(Math.abs(calculateClearAreas(p.plan).clearArea-19.510704)<1e-8);
 p.plan.walls[0].bearing=false;p.plan.walls[0].frameProfile='50x150';assert.equal(report(p).surfaces.find(s=>s.partitionFrame).frameProfile,'50×150');assert.ok(calculateProject(p).lines.some(l=>l.source==='partition-detail'&&/150/.test(l.name)));
});
test('explicit butt scheme trims T fabrication length but never changes saved axes',()=>{
 const p=fixture();p.plan.walls=[wall('h',.174,2,5.826,2),wall('v',3,.174,3,2)];const old=structuredClone(p.plan.walls);assert.equal(Math.round(length(partitionRuns(p.plan))*1000),7478);
 p.plan.partitionJunctions='butt';assert.equal(Math.round(length(partitionRuns(p.plan))*1000),7428);const surface=report(p).surfaces.find(s=>s.partitionFrame&&s.planStart[0]===3000);assert.equal(surface.width,1776);assert.equal(surface.planEnd[1],1950);assert.deepEqual(p.plan.walls,old);assert.equal(calculatePlanMetrics(p.plan).partitionLength,7.43);
});
test('wall-first conversion is explicit, creates shared walls and retains room names and backup',()=>{
 const p=fixture().plan;p.rooms=[room('Кухня',.174,.174,5.652,1.826),room('Спальня',.174,2,5.652,1.826)];const original=structuredClone(p);let n=0;convertToWallLayout(p,()=>`new-${++n}`);assert.equal(p.walls.length,1);assert.equal(p.rooms.length,2);assert.deepEqual(p.rooms.map(r=>r.name).sort(),['Кухня','Спальня']);assert.deepEqual(p.roomLayoutBackup.rooms,original.rooms);
 p.walls[0].y1=p.walls[0].y2=2.3;rebuildWallRooms(p,()=>`new-${++n}`);assert.equal(p.rooms.length,2);assert.equal(p.rooms[0].points.some(q=>Math.abs(q.y-2.25)<1e-8),true);
});
test('wall layout and manual profiles survive EFT JSON; legacy rooms are not converted',()=>{
 const p=fixture();p.plan.layoutMode='walls';p.plan.partitionJunctions='butt';p.plan.walls=[wall('w',.174,2,5.826,2,{frameProfile:'50x150'})];assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).plan.layoutMode,'walls');assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).plan.walls[0].frameProfile,'50x150');assert.notEqual(migrateProject(createDefaultProject()).plan.layoutMode,'walls');
});
test('conversion reparents interior doors without moving them to newly derived room faces',()=>{
 const p=fixture().plan;p.rooms=[room('a',.174,.174,5.652,1.826),room('b',.174,2,5.652,1.826)];p.openings=[{id:'d',type:'door',orientation:'h',outer:false,x:2,y:2,width:.8,height:2.1}];const before=structuredClone(p);let n=0;convertToWallLayout(p,()=>`w${++n}`);preservePlanAttachments(p,before);assert.equal(p.openings[0].y,2);assert.equal(p.openings[0].wallRef,`wall:${p.walls[0].id}`);nudgePlanSelection(p,{type:'wall',id:p.walls[0].id},0,.3);rebuildWallRooms(p,()=>`w${++n}`);assert.equal(p.openings[0].y,2.3);
});
test('room drawing remains a wall-first shortcut without adding duplicate shared walls',()=>{
 const p=fixture().plan;p.layoutMode='walls';p.walls=[wall('existing',.174,2,5.826,2)];let n=0;const r=room('new',.174,.174,3-.174,2-.174);addRoomWalls(p,r,()=>`w${++n}`);assert.equal(p.walls.length,2);assert.ok(!p.walls.some(w=>w.id!=='existing'&&w.y1===2&&w.y2===2));rebuildWallRooms(p,()=>`r${++n}`);assert.equal(p.rooms.length,3);assert.equal(nudgePlanSelection(p,{type:'room',id:p.rooms[0].id},0,.2),false);
});
test('partial bearing wall is never expanded across the ceiling',()=>{
 const surface={geometry:[[[[0,0],[6000,0],[6000,4000],[0,4000],[0,0]]]],supportOuterThickness:174,bearingCuts:[{a:{x:3,y:1},b:{x:3,y:3},profile:'50x150'}]};assert.equal(fullSpanBearingCuts(surface).length,0);surface.bearingCuts[0].a.y=.174;surface.bearingCuts[0].b.y=3.826;assert.equal(fullSpanBearingCuts(surface).length,1);
});
test('finished SIP partition thickness is not replaced by a bearing frame profile',()=>{
 const p=fixture().plan;p.partitionThickness=.174;p.walls=[wall('w',.174,2,5.826,2,{bearing:true,bearingProfile:'50x200'})];assert.equal(wallDepth(p,{x:.174,y:2},{x:5.826,y:2}),.174);
});
test('keyboard movement retains internal T nodes and carries doors on adjoining walls',()=>{
 const p=fixture().plan;p.walls=[wall('h',.174,2,5.826,2),wall('v',3,.174,3,2)];p.openings=[{id:'d',type:'door',outer:false,orientation:'v',x:3,y:1,width:.8,height:2.1}];nudgePlanSelection(p,{type:'wall',id:'h'},0,.3);assert.equal(p.walls[1].y2,2.3);assert.equal(p.openings[0].y,1);assert.equal(p.openings[0].x,3);
});
test('interfloor supports come from the lower floor, not upper room layout',()=>{
 const p=fixture();p.plan.walls=[wall('w',.174,2,5.826,2,{bearing:true,bearingProfile:'50x150'})];ensureProjectFloorCount(p,2);const r=report(p),surface=r.surfaces.find(s=>s.id==='Э2-ПОЛ');assert.equal(surface.supportFloor,1);assert.equal(surface.bearingCuts.length,1);assert.ok(r.ceilingSupportChecks.some(c=>c.surfaceId==='Э2-ПОЛ'));
});
test('support check uses finite bearing width, doors and explicitly supplied spans',()=>{
 const p=fixture().plan,s={id:'ceil',bearingCuts:[{a:{x:3,y:1},b:{x:3,y:3},profile:'50x150',outer:false}]};const m={id:'x',a:[0,2000],b:[3000,2000],length:3000};assert.equal(connectorSupportCheck(m,s,p).status,'needs-project-span');assert.equal(connectorSupportCheck(m,s,p,{ceilingMaxSpanMm:2500}).status,'span-exceeded');assert.equal(connectorSupportCheck(m,s,p,{ceilingMaxSpanMm:3500}).engineeringVerified,false);
 m.b=[3000,500];assert.equal(connectorSupportCheck(m,s,p).status,'unsupported-end');m.b=[3000,2000];p.openings=[{outer:false,x:3,y:2,width:.8}];assert.equal(connectorSupportCheck(m,s,p).status,'unsupported-end');
});
