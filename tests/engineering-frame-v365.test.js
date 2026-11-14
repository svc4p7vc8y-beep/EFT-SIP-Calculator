import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlacement,normalizePlacement,PLACEMENT_PRESETS} from '../src/react/state/placement-model.js';
import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {wallConnectionSnap,nearbyWallPorts,moveAndJoinWallItem,compatiblePorts} from '../src/react/state/engineering-snap.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {moveFrameSelection,structuralStuds,framePost} from '../src/react/calculations/structural-frame.js';
const wall={ref:'outer-0-0',a:{x:0,y:0},b:{x:6,y:0},normal:{x:0,y:1},length:6};
const device=(id,kind,x=1)=>({id,kind,label:kind,floor:1,layer:kind==='pump'?'equipment':'plumbing',x,y:.03,height:1,heightKnown:true,displayPlane:'wall',wallRef:wall.ref,width:.18,depth:.16,rotation:0});
test('water inlet has one outlet; pump has two separate outlets on the left and right edge',()=>{
 const source=device('source','water-source'),pump=device('pump','pump');
 const one=connectionPortsFor(source,wall),pair=connectionPortsFor(pump,wall);
 assert.equal(one.length,1);assert.equal(one[0].connectionMedium,'cold');assert.ok(one[0].x>source.x);
 assert.equal(pair.length,2);assert.ok(pair[0].x<pump.x&&pair[1].x>pump.x);assert.equal(pair[0].height,pair[1].height);
});
test('a fitting snaps to the inlet and to an appliance outlet without requiring a preselected drawing direction',()=>{
 for(const kind of ['water-source','water-heater','pump']){
  const owner=device('owner',kind),fit={...device('fit','ball-valve',2),width:.08,depth:.06},d=createPlacement();d.items=[owner,...connectionPortsFor(owner,wall),fit,...connectionPortsFor(fit,wall)];
  const target=d.items.find(i=>i.linkedApplianceId==='owner'&&i.connectionMedium==='cold'),own=d.items.find(i=>i.linkedApplianceId==='fit'),patch={x:fit.x+target.x-own.x+.04,y:.03,height:fit.height+target.height-own.height};
  assert.ok(nearbyWallPorts(d.items,fit.id,patch,wall).includes(target.id));assert.ok(wallConnectionSnap(d.items,fit.id,patch,wall));
  assert.ok(moveAndJoinWallItem(d,fit.id,patch,wall));assert.equal(d.portConnections.length,1);
  const a=d.items.find(i=>i.id===d.portConnections[0].fromId),b=d.items.find(i=>i.id===d.portConnections[0].toId);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.height-b.height)<.001);
  const restored=normalizePlacement(JSON.parse(JSON.stringify(d)));assert.equal(restored.portConnections.length,1);
 }
});
test('nearby incompatible points are visible but explicit medium/size conflicts cannot form a connection',()=>{
 const a=device('a','ball-valve'),b=device('b','ball-valve',1.18),items=[a,...connectionPortsFor(a,wall),b,...connectionPortsFor(b,wall)],x=items.find(i=>i.linkedApplianceId==='a'),y=items.find(i=>i.linkedApplianceId==='b');
 assert.equal(compatiblePorts(x,{...y,connectionMedium:'hot'},items),false);assert.equal(compatiblePorts({...x,connectionDiameterMm:20},{...y,connectionDiameterMm:32},items),false);
});
test('v10 pump dimensions migrate once and manually specified footprints remain unchanged',()=>{
 const p={...createPlacement(),version:10,items:[{...device('old','pump'),width:.5,depth:.4},{...device('custom','pump'),width:.4,depth:.3}]};
 const a=normalizePlacement(p);assert.equal(a.version,11);assert.equal(a.items.find(i=>i.id==='old').width,.18);assert.equal(a.items.find(i=>i.id==='custom').width,.4);assert.equal(a.items.filter(i=>i.linkedApplianceId==='old').length,2);
});
test('main-plan member arrows add a local displacement and post arrows carry the foundation',()=>{
 const p=createDefaultProject(),r=calculateProductionCutting(p,calculateProject(p)),w=r.surfaces.find(s=>s.exterior),m=structuralStuds(r,w).find(m=>m.a[0]>500);
 const selection={kind:'member',wall:w,member:m,id:m.id};moveFrameSelection(p,selection,10,r);moveFrameSelection(p,selection,100,r);assert.equal(p.settings.productionCutting.memberOverrides[m.key].frameOffsetMm,110);
 const post=framePost(p,w,{x:1000,height:2500});p.settings.productionCutting.roofSupports.push(post,{...post,id:post.id+'-foundation',type:'foundation'});
 moveFrameSelection(p,{kind:'post',wall:w,id:post.id},100,r);const base=p.settings.productionCutting.roofSupports.find(s=>s.type==='foundation');assert.equal(base.x1,post.x1);assert.equal(base.y1,post.y1);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.settings.productionCutting.memberOverrides[m.key].frameOffsetMm,110);
});
