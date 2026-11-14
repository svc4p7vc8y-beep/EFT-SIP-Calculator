import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditPlanObject,planLayerTools,editRoofLine} from '../src/react/planner/layer-tools.js';
import {wallConnectionSnap,moveAndJoinWallItem,compatiblePorts} from '../src/react/state/engineering-snap.js';
import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {createPlacement,normalizePlacement,findPlacementPreset} from '../src/react/state/placement-model.js';
import {engineeringSymbolSize} from '../src/react/state/engineering-symbol-size.js';
import {wallAlignment} from '../src/react/state/engineering-alignment.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {drawPlanRoofPurlin,resizePlanRoofPurlin,movePlanRoofGroup} from '../src/react/planner/roof-support-plan.js';
const wall={ref:'w',a:{x:0,y:0},b:{x:6,y:0},normal:{x:0,y:1},length:6};
const device=(id,x,y=.03)=>({id,kind:'ball-valve',label:id,floor:1,layer:'plumbing',x,y,height:1,heightKnown:true,displayPlane:'wall',wallRef:wall.ref,width:.08,depth:.06,rotation:0,connectionMedium:'cold'});

test('368 inactive visible layers cannot edit objects; each rail contains its own tools',()=>{
 for(const [layer,type] of [['roof','roofAxis'],['roof','roofSupport'],['binding','bindingLine'],['piles','derivedPile'],['plan','opening'],['plan','room']])for(const active of ['roof','binding','piles','plan','frame'])assert.equal(canEditPlanObject(active,type),active===layer);
 assert.ok(planLayerTools('roof').includes('roofAxis'));assert.ok(!planLayerTools('roof').includes('window'));assert.ok(!planLayerTools('plan').includes('pile'));assert.ok(planLayerTools('frame').includes('frameWindow'));
});
test('368 editing either purlin end preserves the opposite end and constraints',()=>{
 const line={axis:'x',start:1,end:5,offset:2,length:6,span:4};
 assert.deepEqual(editRoofLine(line,1,3,0),{...line,start:2});assert.deepEqual(editRoofLine(line,-1,3,1),{...line,end:4});assert.equal(editRoofLine(line,100,0,0).start,4.9);assert.equal(editRoofLine(line,-100,0,1).end,1.1);assert.equal(line.start,1);
});
test('368 visually coincident wall ports join despite different hidden wall clearances',()=>{
 const a=device('a',1),b=device('b',1.25,.25),d=createPlacement();d.items=[a,...connectionPortsFor(a,wall),b,...connectionPortsFor(b,wall)];const target=d.items.find(i=>i.linkedApplianceId==='b'),own=d.items.filter(i=>i.linkedApplianceId==='a')[1],patch={x:a.x+target.x-own.x+.01,y:a.y,height:1};
 const snap=wallConnectionSnap(d.items,a.id,patch,wall);assert.ok(snap);assert.ok(Math.abs(snap.patch.y-.25)<1e-9);moveAndJoinWallItem(d,a.id,patch,wall);assert.equal(d.portConnections.length,1);assert.equal(a.wallClearanceMm,250);assert.equal(normalizePlacement(JSON.parse(JSON.stringify(d))).portConnections.length,1);
 const A=d.items.find(i=>i.id===snap.fromId),B=d.items.find(i=>i.id===snap.toId);assert.ok(Math.hypot(A.x-B.x,A.y-B.y,A.height-B.height)<.001);assert.equal(compatiblePorts(A,{...B,connectionMedium:'hot'},d.items),false);
});
test('368 saved wall guide attracts pipe waypoints and survives migration with labels',()=>{
 const p=createDefaultProject();p.placement=createPlacement();p.placement.wallGuides=[{id:'g',floor:1,wallRef:'w',axis:'height',value:1.2}];const item=device('i',1);Object.assign(item,{showName:true,annotationText:'Фильтр ХВС',labelOffsetX:.42,labelOffsetY:-.3});p.placement.items=[item];p.plan.showLabels=false;
 const n=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(n.plan.showLabels,false);assert.equal(n.placement.wallGuides[0].value,1.2);assert.equal(n.placement.items[0].annotationText,'Фильтр ХВС');const aligned=wallAlignment({x:2,y:0,z:1.19},wall,[],[],.03,null,n.placement.wallGuides);assert.equal(aligned.point.z,1.2);
});
test('368 filter variants use separate body sizes and anchored inlet/outlet ports',()=>{
 const large=findPlacementPreset('water-filter'),small=findPlacementPreset('water-filter-small');assert.ok(large.width>small.width);assert.ok(large.bodyHeightM>small.bodyHeightM);for(const preset of [large,small]){const item={...device('f',1),...preset,kind:preset.id,id:'f'};assert.equal(engineeringSymbolSize(item).height,preset.bodyHeightM*100);const ports=connectionPortsFor(item,wall);assert.equal(ports.length,2);assert.ok(ports[0].x<ports[1].x);}
});
test('368 manual purlin on a hanging roof reaches 3D assembly and purchasing only once',()=>{
 const p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:6,h:4,points:[],contourDefined:true},rooms:[],walls:[],openings:[]});const c=calculateProject(p),r=calculateProductionCutting(p,c),member=drawPlanRoofPurlin(p,r.assembly.roofModel,{x:1,y:1},{x:5,y:1});p.settings.productionCutting.roofSupports=[member];assert.equal(member.profile,p.settings.productionCutting.autoRoofSupports.purlinProfile);const restored=migrateProject(JSON.parse(JSON.stringify(p))),rr=calculateProductionCutting(restored,calculateProject(restored));assert.ok(rr.assembly.supports.some(s=>s.id===member.id));assert.equal(productionEstimateLines(restored).filter(l=>l.id.includes(member.id)).length,1);
 const shifted=movePlanRoofGroup(restored.settings.productionCutting.roofSupports,member.id,0,.25,rr.assembly.roofModel);assert.notEqual(shifted[0].z1,member.z1);
 const moved=resizePlanRoofPurlin(restored.settings.productionCutting.roofSupports,member.id,1,{x:4,y:1},rr.assembly.roofModel);assert.equal(moved[0].x1,member.x1);assert.equal(moved[0].x2,4000);assert.throws(()=>resizePlanRoofPurlin(moved,member.id,1,{x:50,y:1},rr.assembly.roofModel));
});
