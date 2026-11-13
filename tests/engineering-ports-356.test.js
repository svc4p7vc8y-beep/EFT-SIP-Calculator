import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {moveAndJoinWallItem,wallConnectionSnap,rotateWallItem,normalizedPortConnections} from '../src/react/state/engineering-snap.js';
import {createPlacement,normalizePlacement,PLACEMENT_PRESETS} from '../src/react/state/placement-model.js';
import {engineeringCatalogIncludes} from '../src/react/state/engineering-catalog.js';
const wall={ref:'w',a:{x:0,y:0},b:{x:5,y:0},length:5,normal:{x:0,y:1}};
const device=(id,kind,x,height=1)=>({id,kind,label:kind,x,y:.03,height,heightKnown:true,floor:1,layer:kind==='electric-boiler'?'heating':'plumbing',width:.4,depth:.3,wallRef:'w',displayPlane:'wall',rotation:0,connectionMedium:kind==='electric-boiler'?undefined:'cold'});
const add=(data,item)=>data.items.push(item,...connectionPortsFor(item,wall));
test('electric boiler has a lower return inlet and upper supply outlet',()=>{
 const item=device('b','electric-boiler',2),ports=connectionPortsFor(item,wall);assert.equal(ports.length,2);assert.ok(ports.find(p=>p.connectionMedium==='return').height<item.height);assert.ok(ports.find(p=>p.connectionMedium==='supply').height>item.height);
});
test('appliances and sanitary fixtures are available without leaving engineering',()=>{
 for(const id of ['washer','dishwasher','bathtub','bathroom-sink','toilet','electric-boiler','heat-safety-group','heating-hydro-tank','pressure-switch']){const p=PLACEMENT_PRESETS.find(p=>p.id===id);assert.ok(p,id);assert.ok(engineeringCatalogIncludes(p,'plumbing'),id);}
 assert.deepEqual(connectionPortsFor(device('wm','washer',1)).map(p=>p.connectionMedium),['cold']);
});
test('compatible fitting ports snap together and persist as a joint without adding pipe length',()=>{
 const d=createPlacement();add(d,device('a','pp-valve',1));add(d,device('b','pp-valve',2));
 const snap=moveAndJoinWallItem(d,'b',{x:1.44,y:.03,height:1},wall);assert.ok(snap);assert.equal(d.portConnections.length,1);assert.equal(d.networks.plumbing.length,0);
 const restored=normalizePlacement(JSON.parse(JSON.stringify(d)));assert.deepEqual(restored.portConnections,d.portConnections);
 moveAndJoinWallItem(d,'b',{x:3,y:.03,height:1},wall);assert.equal(d.portConnections.length,0);
});
test('different media, floors, occupied ports and same-facing ports cannot join',()=>{
 const d=createPlacement();add(d,device('a','pp-valve',1));add(d,{...device('b','pp-valve',2),connectionMedium:'hot'});assert.equal(wallConnectionSnap(d.items,'b',{x:1.4,y:.03,height:1},wall),null);
 d.items.filter(i=>i.linkedApplianceId==='b').forEach(i=>{i.connectionMedium='cold';i.floor=2;});assert.equal(wallConnectionSnap(d.items,'b',{x:1.4,y:.03,height:1},wall),null);
});
test('rotation transforms connector geometry and invalidates a separated joint',()=>{
 const d=createPlacement(),item=device('a','pp-valve',1);add(d,item);const first=d.items[1];assert.equal(first.height,1);rotateWallItem(d,'a',wall);assert.equal(item.rotation,90);assert.ok(first.height>1);assert.ok(Math.abs(first.connectorV-1)<1e-8);
});
test('missing endpoint, duplicate joint and self-connection are rejected during import',()=>{
 const d=createPlacement();add(d,device('a','pp-valve',1));add(d,device('b','pp-valve',1.4));const a=d.items.find(i=>i.id==='port-a-1'),b=d.items.find(i=>i.id==='port-b-0');assert.equal(a.x,b.x);
 const links=[{fromId:a.id,toId:b.id},{fromId:b.id,toId:a.id},{fromId:a.id,toId:'missing'},{fromId:a.id,toId:a.id}];assert.equal(normalizedPortConnections(links,d.items).length,1);
});

test('a heating fitting cannot inherit a stale cold-water medium from the previous tab',()=>{
 const fitting={...device('a','heat-pp-valve',1),layer:'heating',connectionMedium:'cold'};assert.ok(connectionPortsFor(fitting,wall).every(p=>p.connectionMedium==='supply'&&p.layer==='heating'));
});

import {compatiblePorts} from '../src/react/state/engineering-snap.js';
import {networkBill} from '../src/react/state/placement-networks.js';
test('known incompatible materials and diameters require an explicit adapter',()=>{
 const d=createPlacement();add(d,{...device('a','pp-valve',1),connectionMaterial:'metal',connectionDiameterMm:20});add(d,{...device('b','pp-valve',1.4),connectionMaterial:'pp',connectionDiameterMm:32});
 const a=d.items.find(i=>i.id==='port-a-1'),b=d.items.find(i=>i.id==='port-b-0');assert.equal(compatiblePorts(a,b,d.items),false);d.items.find(i=>i.id==='b').kind='metal-pp-adapter';assert.equal(compatiblePorts(a,b,d.items),true);
});
test('joint endpoints are connected in the bill without extra pipe metres or duplicate fittings',()=>{
 const d=createPlacement();add(d,device('a','pp-valve',1));add(d,device('b','pp-valve',2));moveAndJoinWallItem(d,'b',{x:1.4,y:.03,height:1},wall);const bill=networkBill(d,'plumbing',1);
 assert.equal(bill.totalLength,0);assert.equal(bill.connections.length,1);assert.ok(!bill.unconnected.some(i=>i.id==='port-a-1'||i.id==='port-b-0'));assert.equal(bill.components.reduce((n,row)=>n+row.quantity,0),2);
});

test('migration places unconnected generated ports on appliance outlines and preserves manual or piped ports',()=>{
 const data=createPlacement(),item=device('b','electric-boiler',2);add(data,item);data.version=7;
 data.items.find(i=>i.id==='port-b-0').height=0;data.items.find(i=>i.id==='port-b-1').height=.9;data.items.find(i=>i.id==='port-b-1').followsAppliance=false;
 const plan={house:{w:5,h:4},wallThickness:.174,rooms:[],walls:[]};item.wallRef='outer-0-0';data.items.forEach(i=>i.wallRef=item.wallRef);
 const migrated=normalizePlacement(data,[plan]);assert.ok(migrated.items.find(i=>i.id==='port-b-0').height>0);assert.equal(migrated.items.find(i=>i.id==='port-b-1').height,.9);
});

test('a floor appliance placed on the plan has its cold outlet projected to its wall, without an invented installation height',()=>{
 const washer={...device('wm','washer',2),y:.35,height:0,heightKnown:false,displayPlane:'auto',depth:.6};const ports=connectionPortsFor(washer,wall);assert.equal(ports.length,1);assert.equal(ports[0].y,.03);assert.equal(ports[0].height,0);assert.equal(ports[0].heightKnown,false);
});
import {rotatePlanItem} from '../src/react/state/engineering-snap.js';
test('plan rotation preserves installation heights while moving attached outlets with the appliance',()=>{
 const d=createPlacement(),item=device('a','pp-valve',1);add(d,item);const before=d.items[1],dx=before.x-item.x,dy=before.y-item.y,h=before.height;rotatePlanItem(d,'a');assert.equal(item.rotation,90);assert.ok(Math.abs(before.x-(item.x-dy))<1e-8);assert.ok(Math.abs(before.y-(item.y+dx))<1e-8);assert.equal(before.height,h);
});
