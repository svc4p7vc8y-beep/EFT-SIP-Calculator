import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlacement,normalizePlacement} from '../src/react/state/placement-model.js';
import {connectionPortsFor,refreshDeviceOutlets} from '../src/react/state/placement-connections.js';
import {moveAndJoinWallItem,normalizedPortConnections} from '../src/react/state/engineering-snap.js';
import {engineeringMoveIds} from '../src/react/state/engineering-move-group.js';
const wall={ref:'w',a:{x:0,y:0},b:{x:5,y:0},length:5,normal:{x:0,y:1}};
const add=(d,id,kind,x,height=1,rotation=0)=>{const owner={id,kind,label:kind,layer:'plumbing',floor:1,x,y:.03,height,rotation,width:.4,depth:.3,wallRef:'w',displayPlane:'wall',heightKnown:true,connectionMedium:'cold'};d.items.push(owner,...connectionPortsFor(owner,wall));return owner;};
test('moving a device carries a connected fitting chain and preserves its joints',()=>{
 const d=createPlacement(),owner=add(d,'tank','hydro-tank',1),valve=add(d,'valve','ball-valve',1,.56,90);
 const port=d.items.find(i=>i.id==='port-tank-0');moveAndJoinWallItem(d,valve.id,{x:port.x,y:.03,height:port.height-.2},wall);assert.equal(d.portConnections.length,1);
 const before=structuredClone(d.items),ids=engineeringMoveIds(d.items,d.portConnections,owner.id);assert.ok(ids.has(valve.id));
 moveAndJoinWallItem(d,owner.id,{x:2,y:.03,height:1.3},wall);assert.equal(d.portConnections.length,1);
 for(const id of ids){const a=before.find(i=>i.id===id),b=d.items.find(i=>i.id===id);assert.ok(Math.abs(b.x-a.x-1)<1e-8);assert.ok(Math.abs(b.height-a.height-.3)<1e-8);}
 assert.equal(normalizedPortConnections(d.portConnections,d.items).length,1);
});
test('an outlet moves independently, remains attached to its owner and persists after JSON reopen',()=>{
 const d=createPlacement(),owner=add(d,'heater','water-heater',2);const port=d.items.find(i=>i.id==='port-heater-0'),before=structuredClone(owner);
 moveAndJoinWallItem(d,port.id,{x:1,y:.03,height:.3},wall);assert.deepEqual({x:owner.x,height:owner.height},{x:before.x,height:before.height});assert.equal(port.followsAppliance,true);
 refreshDeviceOutlets(d.items,owner.id,wall);assert.ok(Math.abs(port.x-1)<.001);assert.ok(Math.abs(port.height-.3)<.001);
 const copy=normalizePlacement(JSON.parse(JSON.stringify(d)));assert.deepEqual(copy.items.find(i=>i.id===owner.id).portLayout,owner.portLayout);
 moveAndJoinWallItem(copy,owner.id,{x:3,y:.03,height:1.2},wall);assert.ok(Math.abs(copy.items.find(i=>i.id===port.id).x-2)<.001);
});
test('detaching a fitting does not pull the connected appliance or leave a stale joint',()=>{
 const d=createPlacement();add(d,'a','pp-valve',1);const b=add(d,'b','pp-valve',2);moveAndJoinWallItem(d,b.id,{x:1.4,y:.03,height:1},wall);assert.equal(d.portConnections.length,1);
 moveAndJoinWallItem(d,b.id,{x:3,y:.03,height:1},wall);assert.equal(d.items.find(i=>i.id==='a').x,1);assert.equal(d.portConnections.length,0);
});
