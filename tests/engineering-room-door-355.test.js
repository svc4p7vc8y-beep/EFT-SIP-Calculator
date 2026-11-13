import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {placementWallFaces,roomWallFaces} from '../src/react/state/placement-walls.js';
import {engineeringCatalogIncludes,engineeringDrawingPreset} from '../src/react/state/engineering-catalog.js';
import {PLACEMENT_PRESETS} from '../src/react/state/placement-model.js';
import {projectOpeningToWall} from '../src/react/planner/geometry.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
const simple=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:10,h:6},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],bindingLines:[],piles:[],pileRows:[]};p.services.roof=false;return p;};
test('small rooms can select overlapping portions of long exterior walls without selecting the opposite partition face',()=>{
 const p=simple();p.plan.rooms=[{id:'room',name:'Room',x:.174,y:.174,w:2,h:2}];const faces=placementWallFaces(p.plan),choices=roomWallFaces(p.plan.rooms[0],faces);
 assert.ok(choices.some(w=>w.ref==='outer-0-0'));assert.ok(choices.every(w=>w.type==='outer'||w.normal.x<0||w.normal.y<0));
 assert.deepEqual(roomWallFaces(null,faces),faces);
});
test('wall equipment remains in the chosen engineering discipline and can be connected',()=>{
 for(const [kind,system] of [['boiler','heating'],['hydro-tank','plumbing'],['expansion-tank','heating'],['water-heater','plumbing'],['radiator-point','heating']]){
  const preset=PLACEMENT_PRESETS.find(p=>p.id===kind);assert.ok(preset,kind);assert.equal(engineeringCatalogIncludes(preset,system),true,kind);assert.equal(engineeringDrawingPreset(preset,system).layer,system);
 }
 assert.equal(engineeringCatalogIncludes(PLACEMENT_PRESETS.find(p=>p.id==='sofa'),'plumbing'),false);
});
test('door placed near a wall corner is clamped within that wall',()=>{
 const p=simple(),door=projectOpeningToWall({type:'door',width:.86,height:2.05,doorType:'entrance'},{x:.05,y:0},p.plan,{lockDoorType:true,endInset:.424});
 assert.equal(door.outer,true);assert.ok(door.x>=.854);assert.equal(door.y,0);p.plan.openings=[{id:'door',...door}];const report=calculateProductionCutting(p,calculateProject(p));assert.equal(report.surfaces.filter(s=>s.exterior&&s.blocked).length,0);
});
test('an orphan opening does not block every unrelated wall',()=>{
 const p=simple();p.plan.openings=[{id:'orphan',type:'door',outer:true,orientation:'h',x:5,y:3,width:.86,height:2.05}];const report=calculateProductionCutting(p,calculateProject(p));
 assert.ok(report.issues.some(i=>i.code==='OPENING_WALL'));assert.equal(report.surfaces.filter(s=>s.exterior&&s.blocked).length,0);
});
test('floor and ceiling direction settings survive JSON migration and affect only the selected decks',()=>{
 const p=simple();p.settings.productionCutting.floorDirection='y';p.settings.productionCutting.ceilingDirection='x';
 const migrated=migrateProject(JSON.parse(JSON.stringify(p))),report=calculateProductionCutting(migrated,calculateProject(migrated));
 assert.equal(report.surfaces.find(s=>s.id==='Э1-ПОЛ').layout.direction,'y');assert.equal(report.surfaces.find(s=>s.id==='Э1-ПТ').layout.direction,'x');
 assert.ok(report.surfaces.filter(s=>s.exterior).every(s=>!s.layout.direction));
});

import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {moveEngineeringItem} from '../src/react/state/engineering-scheme.js';
test('wall appliance ports follow installation height and the wall tangent, including after moving',()=>{
 const item={id:'b',kind:'boiler',label:'Котёл',layer:'heating',floor:1,x:2,y:3,width:.7,depth:.5,height:1.2,heightKnown:true,displayPlane:'wall',wallRef:'wall'};
 const ports=connectionPortsFor(item,{normal:{x:1,y:0}});assert.ok(ports.length);assert.ok(ports.every(p=>p.height<1.2&&p.heightKnown&&p.x===2));
 const heights=ports.map(p=>p.height);const data={items:[item,...ports]};moveEngineeringItem(data,'b',{x:3,y:4,height:1.6});assert.ok(data.items.slice(1).every((p,i)=>Math.abs(p.height-heights[i]-.4)<.001&&p.x===3));
 assert.ok(connectionPortsFor({...item,displayPlane:'floor'}).every(p=>p.height===0&&!p.heightKnown));
});

import {openingWallCandidates} from '../src/react/calculations/wall-geometry-adapter.js';
test('planner and production bind doors on the same slightly skewed wall without changing its contour',()=>{
 const p=simple();p.plan.house.points=[{x:0,y:0},{x:10,y:.024},{x:10,y:6},{x:0,y:6}];const before=JSON.stringify(p.plan.house.points);
 const door=projectOpeningToWall({id:'skew-door',type:'door',width:.86,height:2.05,doorType:'entrance'},{x:4,y:.012},p.plan,{lockDoorType:true});p.plan.openings=[door];
 const report=calculateProductionCutting(p,calculateProject(p));assert.ok(!report.issues.some(i=>i.code==='OPENING_WALL'));assert.equal(JSON.stringify(p.plan.house.points),before);
 assert.equal(openingWallCandidates({orientation:'h',x:4,y:0},[{a:{x:0,y:0},b:{x:10,y:1}}]).length,0);
});
