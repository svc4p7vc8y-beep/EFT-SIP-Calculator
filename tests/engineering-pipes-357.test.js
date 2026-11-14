import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {createPlacement,normalizePlacement} from '../src/react/state/placement-model.js';
import {drawingPipeProfile,pipeStemDirection} from '../src/react/state/engineering-pipe-tools.js';

const wall={ref:'outer-0-0',a:{x:0,y:.174},b:{x:5,y:.174},length:5,normal:{x:0,y:1}};
const tank={id:'tank',kind:'hydro-tank',label:'Бак',x:2,y:.204,height:1,heightKnown:true,displayPlane:'wall',wallRef:wall.ref,floor:1,layer:'plumbing',width:.55,depth:.55,rotation:0};
test('hydro tank has exactly one central bottom connector that rotates with the body',()=>{
 const [p,...extra]=connectionPortsFor(tank,wall);assert.equal(extra.length,0);assert.equal(p.x,tank.x);assert.equal(p.height,.76);assert.equal(p.connectorV,-1);
 const [turned]=connectionPortsFor({...tank,rotation:90},wall);assert.ok(turned.x<tank.x);assert.equal(turned.height,tank.height);
 assert.deepEqual(pipeStemDirection(p,tank,true),{x:0,y:1});
});
test('v8 tank migration removes only an unused automatic extra outlet, preserving manual and piped data',()=>{
 const data=createPlacement();data.version=8;
 const [p]=connectionPortsFor(tank,wall);data.items=[tank,p,{...p,id:'port-tank-1',x:2.1}];
 const plan={house:{w:5,h:4},wallThickness:.174,rooms:[],walls:[]};
 assert.equal(normalizePlacement(data,[plan]).items.filter(i=>i.linkedApplianceId==='tank').length,1);
 data.networks.plumbing=[{id:'r',floor:1,fromId:'port-tank-1',toId:p.id,medium:'cold',points:[{x:2.1,y:.204,z:.75},{x:2,y:.204,z:.75}]}];
 const restored=normalizePlacement(data,[plan]);assert.equal(restored.items.find(i=>i.id==='port-tank-1').x,2.1);assert.equal(restored.networks.plumbing.length,1);
 data.networks.plumbing=[];data.items[2].followsAppliance=false;assert.equal(normalizePlacement(data,[plan]).items.length,3);
});
test('pipe tool supplies explicit drawing defaults and preserves saved custom specifications',()=>{
 assert.equal(drawingPipeProfile().material,'Полипропилен ПП-R');assert.equal(drawingPipeProfile().diameterMm,20);
 assert.deepEqual(drawingPipeProfile({material:'Медь',diameterMm:18,clearanceMm:40}),{material:'Медь',diameterMm:18,clearanceMm:40});
});
