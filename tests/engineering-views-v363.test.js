import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionPortsFor,refreshDeviceOutlets} from '../src/react/state/placement-connections.js';
import {outletAnchor,movableDeviceOutlet,portHandleRadius} from '../src/react/state/engineering-outlets.js';
import {saveOutletPosition} from '../src/react/state/engineering-move-group.js';
import {rotateWallItem,rotatePlanItem,moveAndJoinWallItem} from '../src/react/state/engineering-snap.js';
import {engineeringElevationCenter,engineeringSymbolSize} from '../src/react/state/engineering-symbol-size.js';
import {engineeringWallItems,engineeringPlanRotation} from '../src/react/state/engineering-projection.js';
import {createPlacement,normalizePlacement} from '../src/react/state/placement-model.js';
import {wallRouteParts} from '../src/react/state/engineering-wall.js';
const wall={ref:'front',a:{x:0,y:0},b:{x:5,y:0},normal:{x:0,y:1},length:5};
const rear={...wall,ref:'rear',a:{x:0,y:-.1},b:{x:5,y:-.1},normal:{x:0,y:-1}};
const item=kind=>({id:kind,kind,label:kind,floor:1,layer:'plumbing',wallRef:wall.ref,displayPlane:'wall',height:1,heightKnown:true,x:2,y:.03,width:.4,depth:.3,rotation:0});
test('fitting endpoints ignore old positional overrides and cannot be dragged independently',()=>{
 const fitting=item('pp-valve');fitting.portLayout={0:{x:.8,y:.1,side:'top',thread:'1/2"'}};
 const anchor=outletAnchor(fitting,0,2);assert.equal(anchor.x,0);assert.equal(anchor.y,.5);assert.equal(anchor.side,'left');assert.equal(anchor.thread,'1/2"');
 const data=createPlacement();data.items=[fitting,...connectionPortsFor(fitting,wall)];const port=data.items[1],before=structuredClone(data);
 assert.equal(movableDeviceOutlet(port,data.items),false);assert.equal(saveOutletPosition(data.items,port,wall),false);
 assert.equal(moveAndJoinWallItem(data,port.id,{x:4,y:1,height:2},wall),null);assert.deepEqual(data,before);
 rotateWallItem(data,port.id,wall);assert.deepEqual(data,before);
 rotateWallItem(data,fitting.id,wall);assert.equal(fitting.rotation,90);
});
test('device outlet rotates at the same position and its orientation survives regeneration',()=>{
 const owner=item('water-heater'),data=createPlacement();data.items=[owner,...connectionPortsFor(owner,wall)];const p=data.items[1],position=[p.x,p.y,p.height],direction=[p.connectorU,p.connectorV];
 assert.equal(movableDeviceOutlet(p,data.items),true);rotateWallItem(data,p.id,wall);
 assert.deepEqual([p.x,p.y,p.height],position);assert.notDeepEqual([p.connectorU,p.connectorV],direction);
 const rotated=[p.connectorU,p.connectorV];refreshDeviceOutlets(data.items,owner.id,wall);assert.ok(Math.hypot(p.connectorU-rotated[0],p.connectorV-rotated[1])<1e-8);
});
test('plan-only outlet rotation stays attached and is retained in the device port layout',()=>{
 const owner={...item('washer'),wallRef:'',displayPlane:'auto'},data=createPlacement();data.items=[owner,...connectionPortsFor(owner)];const p=data.items[1],before=[p.x,p.y,p.height],dir=[p.connectorPlanX,p.connectorPlanY];
 rotatePlanItem(data,p.id);assert.deepEqual([p.x,p.y,p.height],before);assert.notDeepEqual([p.connectorPlanX,p.connectorPlanY],dir);
 const next=connectionPortsFor(owner)[0];assert.ok(Math.abs(next.connectorPlanX-p.connectorPlanX)<1e-8);assert.ok(Math.abs(next.connectorPlanY-p.connectorPlanY)<1e-8);
});
test('floor fixtures have a bottom datum and radiator body height is a separate parameter',()=>{
 for(const kind of ['bathtub','washer','dishwasher','toilet']){const device={...item(kind),height:0};const size=engineeringSymbolSize(device);assert.equal(engineeringElevationCenter(device)-size.height/200,0);}
 const radiator={...item('radiator-point'),radiatorSections:12,radiatorHeightMm:900,width:1.2};assert.deepEqual(engineeringSymbolSize(radiator),{width:120,height:90});
 const data=createPlacement();data.items=[radiator];const restored=normalizePlacement(JSON.parse(JSON.stringify(data)));assert.equal(restored.items[0].radiatorSections,12);assert.equal(restored.items[0].radiatorHeightMm,900);
 assert.ok(portHandleRadius({})<=1.2);assert.ok(portHandleRadius({connectionDiameterMm:100})<=1.2);
});
test('equipment belongs to one wall face and wall-mounted footprints follow that wall tangent',()=>{
 const device=item('water-heater');assert.equal(engineeringWallItems(wall,[wall,rear],[device]).length,1);assert.equal(engineeringWallItems(rear,[wall,rear],[device]).length,0);
 delete device.wallRef;assert.equal(engineeringWallItems(rear,[wall,rear],[device]).length,0);
 const vertical={...wall,a:{x:0,y:0},b:{x:0,y:5}};assert.equal(engineeringPlanRotation(item('washer'),vertical),90);assert.equal(engineeringPlanRotation({...item('washer'),displayPlane:'auto',rotation:180},vertical),180);
});
test('wall-assigned pipes remain visible at appliance depth without duplicating the opposite face',()=>{
 const front={...wall,ref:'partition-0-0'},back={...rear,ref:'partition-0-1'};
 const route={wallRef:front.ref,points:[{x:1,y:.4,z:1},{x:3,y:.4,z:1},{x:3,y:.4,z:.3}]};
 assert.equal(wallRouteParts(route,front).length,2);assert.equal(wallRouteParts(route,back).length,0);
 assert.equal(wallRouteParts({...route,wallRef:''},front).length,0);
});
