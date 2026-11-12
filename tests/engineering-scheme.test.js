import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { createPlacement, normalizePlacement } from '../src/react/state/placement-model.js';
import { addBasicEngineeringScheme, connectEngineeringItems, moveEngineeringItem, schemePosition } from '../src/react/state/engineering-scheme.js';
import { networkBill, resolvedNetworkRoutes, networkLength3d } from '../src/react/state/placement-networks.js';
import { buildPrintablePlacementSheets } from '../src/react/export/placement-sheets.js';
import { connectionPortsFor } from '../src/react/state/placement-connections.js';
let sequence = 0; const id = () => 'eng-' + ++sequence;
const fixture = () => { const project = createDefaultProject(); project.placement = createPlacement(); return project; };
const node = (kind, layer, medium, x = 3, y = 2) => ({ id: id(), kind, layer, floor: 1, label: kind, x, y, width: .2, depth: .15, height: .5, heightKnown: true, ...(medium ? { connectionMedium: medium } : {}) });
for (const system of ['plumbing', 'heating', 'sewer']) test(system + ' basic template is additive, idempotent and survives JSON/migration', () => {
  const p = fixture(); const d = p.placement;
  addBasicEngineeringScheme(d, p.plan, system, 1, {}, id);
  const saved = structuredClone(d);
  addBasicEngineeringScheme(d, p.plan, system, 1, {}, id);
  assert.deepEqual(d, saved);
  assert.deepEqual(normalizePlacement(JSON.parse(JSON.stringify(d))).networks, normalizePlacement(saved).networks);
  const migrated = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(migrated.placement.items.length, d.items.length);
  assert.equal(new Set(d.networks[system].map(r => [r.fromId, r.toId, r.medium].join('|'))).size, d.networks[system].length);
});
test('cold entry, isolation, filter and house sewer outlet are explicit, without optional water equipment', () => {
  const p = fixture(); for (const system of ['plumbing', 'sewer']) addBasicEngineeringScheme(p.placement, p.plan, system, 1, {}, id);
  const kinds = p.placement.items.map(i => i.kind);
  for (const k of ['water-source', 'water-valve', 'water-inlet-filter', 'sewer-building-outlet', 'sewer-cleanout']) assert.ok(kinds.includes(k));
  assert.ok(!kinds.includes('water-heater-point')); assert.ok(!kinds.includes('water-pressure-reducer'));
  assert.ok(p.placement.items.every(i => i.heightKnown === false));
  assert.ok(networkBill(p.placement, 'plumbing', 1, p.plan).issues.some(i => i.includes('высота')));
});
test('hot water only adds a heater for real consumers; collector mode retains both media', () => {
  const p = fixture(); p.placement.items.push(node('cold-outlet','plumbing','cold'), node('hot-outlet','plumbing','hot'));
  addBasicEngineeringScheme(p.placement,p.plan,'plumbing',1,{distribution:'collector'},id);
  for (const k of ['water-heater-point','cold-manifold','hot-manifold']) assert.ok(p.placement.items.some(i=>i.kind===k));
  assert.ok(p.placement.networks.plumbing.some(r=>r.medium==='hot'));
});
test('manual routes and geometry are preserved and do not receive a second automatic feed', () => {
  const p=fixture(), a=node('cold-outlet','plumbing','cold'), b=node('water-source','plumbing','cold',1,1);p.placement.items.push(a,b);
  const r=connectEngineeringItems(p.placement,'plumbing',1,b.id,a.id,'cold',id);r.auto=false;r.points=[{x:1,y:1,z:.5},{x:1,y:2,z:.5},{x:3,y:2,z:.5}];
  const saved=structuredClone(r);addBasicEngineeringScheme(p.placement,p.plan,'plumbing',1,{},id);
  assert.deepEqual(p.placement.networks.plumbing.find(i=>i.id===r.id),saved);
  assert.equal(p.placement.networks.plumbing.filter(r=>r.toId===a.id).length,1);
});
test('built-in boiler equipment does not add external duplicates', () => {
 const p=fixture();addBasicEngineeringScheme(p.placement,p.plan,'heating',1,{builtInPump:true,builtInExpansion:true,builtInSafety:true},id);
 assert.equal(normalizePlacement(JSON.parse(JSON.stringify(p.placement))).engineeringDefaults['heating-1'].builtInPump,true);
 for(const kind of ['heat-pump-point','heat-expansion-tank','heat-safety-group'])assert.ok(!p.placement.items.some(i=>i.kind===kind));
});
test('existing boiler connection ports are reused instead of adding a second heat source',()=>{
 const p=fixture(), boiler=node('boiler','equipment');p.placement.items.push(boiler,...connectionPortsFor(boiler),node('radiator-point','heating'));
 addBasicEngineeringScheme(p.placement,p.plan,'heating',1,{},id);
 assert.ok(!p.placement.items.some(i=>i.kind==='heat-source'));
 const sourceIds=p.placement.items.filter(i=>i.linkedApplianceId===boiler.id&&i.layer==='heating').map(i=>i.id);
 for(const sourceId of sourceIds)assert.ok(p.placement.networks.heating.some(r=>r.fromId===sourceId||r.toId===sourceId));
});
test('incompatible media, floor and system cannot be connected',()=>{
 const d=createPlacement(),a=node('cold-outlet','plumbing','cold'),b=node('hot-outlet','plumbing','hot');d.items.push(a,b);
 assert.equal(connectEngineeringItems(d,'plumbing',1,a.id,b.id,'cold',id),null);
 assert.equal(connectEngineeringItems(d,'plumbing',2,a.id,b.id,'hot',id),null);
 assert.equal(connectEngineeringItems(d,'heating',1,a.id,b.id,'supply',id),null);
});
test('moving a diagram does not alter actual pipe length; moving the wall node does',()=>{
 const p=fixture(),a=node('water-source','plumbing','cold',1,1),b=node('cold-outlet','plumbing','cold',2,1);p.placement.items.push(a,b);
 connectEngineeringItems(p.placement,'plumbing',1,a.id,b.id,'cold',id);
 const routeCount=p.placement.networks.plumbing.length; connectEngineeringItems(p.placement,'plumbing',1,b.id,a.id,'cold',id); assert.equal(p.placement.networks.plumbing.length,routeCount);
 const length=networkLength3d(resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan)[0].points);
 b.networkDiagram={x:900,y:900};assert.deepEqual(schemePosition(b,0),b.networkDiagram);
 assert.equal(networkLength3d(resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan)[0].points),length);
 moveEngineeringItem(p.placement,b.id,{x:4,height:1});
 assert.ok(networkLength3d(resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan)[0].points)>length);
});
test('linked appliance ports move in three dimensions; heights become confirmed',()=>{
 const d=createPlacement(),a=node('boiler','equipment');d.items.push(a,...connectionPortsFor(a));const before=structuredClone(d.items[1]);
 moveEngineeringItem(d,a.id,{x:a.x+1,y:a.y+2,height:a.height+.7,wallRef:'outer-0-0'});
 const port=d.items[1];assert.equal(port.x,before.x+1);assert.equal(port.y,before.y+2);assert.equal(port.height,.7);assert.equal(port.heightKnown,true);assert.equal(port.wallRef,'outer-0-0');
});
test('each explicit node is counted once, even when a boiler kit has also been filled',()=>{
 const p=fixture();addBasicEngineeringScheme(p.placement,p.plan,'heating',1,{},id);const source=p.placement.items.find(i=>i.kind==='heat-source');source.pipeKit=[1,1,1,1,2,1,1,2];
 const bill=networkBill(p.placement,'heating',1,p.plan);
 assert.equal(bill.components.find(r=>r.name==='Циркуляционный насос отопления')?.quantity,1);
 assert.equal(bill.components.find(r=>r.name==='Расширительный бак отопления')?.quantity,1);
 assert.equal(bill.components.find(r=>r.name==='Разъёмное соединение')?.quantity,2);
 assert.ok(!bill.components.some(r=>r.name==='Разъёмное соединение котла'));
});
test('wall printing retains the same network graph and legacy diagram coordinates',()=>{
 const p=fixture();addBasicEngineeringScheme(p.placement,p.plan,'sewer',1,{},id);p.placement.items[0].networkDiagram={x:730,y:140};
 const sheets=buildPrintablePlacementSheets(p);const sheet=sheets.find(s=>s.kind==='network-wall');assert.ok(sheet);
 assert.deepEqual(sheet.items[0].item.networkDiagram,{x:730,y:140});assert.equal(sheet.routes.length,p.placement.networks.sewer.length);
});

test('automatic sewage follows horizontal wall paths with continuous grade, without vertical steps',()=>{
 const p=fixture();addBasicEngineeringScheme(p.placement,p.plan,'sewer',1,{},id);
 const r=resolvedNetworkRoutes(p.placement,'sewer',1,p.plan)[0];assert.ok(r.points.length>=2);
 for(let i=1;i<r.points.length;i++){assert.ok(r.points[i].z<=r.points[i-1].z);assert.ok(Math.hypot(r.points[i].x-r.points[i-1].x,r.points[i].y-r.points[i-1].y)>0);}
});
test('upper floors use risers, not another house inlet or external sewage exit',()=>{
 const p=fixture();for(const sys of ['plumbing','sewer'])addBasicEngineeringScheme(p.placement,p.plan,sys,2,{},id);
 assert.ok(!p.placement.items.some(i=>['water-source','sewer-building-outlet'].includes(i.kind)));
 assert.ok(p.placement.items.some(i=>i.kind==='water-riser'));assert.ok(p.placement.items.some(i=>i.kind==='sewer-stack'));
});
test('sewer junction fittings are counted once with an explicit tee at the same location',()=>{
 const p=fixture(), d=p.placement;
 const nodes=[node('sewer-outlet','sewer',null,1,1),node('sewer-tee','sewer',null,2,1),node('sewer-outlet','sewer',null,2,2),node('sewer-building-outlet','sewer',null,3,1)];d.items.push(...nodes);
 for(const [a,b]of[[0,1],[2,1],[1,3]]){const r=connectEngineeringItems(d,'sewer',1,nodes[a].id,nodes[b].id,'waste',id);r.auto=false;r.routing='legacy';}
 const bill=networkBill(d,'sewer',1,p.plan);assert.equal(bill.components.filter(r=>r.name==='Тройник канализации').reduce((n,r)=>n+r.quantity,0),1);
});

test('an existing upper-floor sewer riser is an outlet, never a consumer loop',()=>{
 const p=fixture(), riser=node('sewer-stack','sewer');riser.floor=2;p.placement.items.push(riser);
 addBasicEngineeringScheme(p.placement,p.plan,'sewer',2,{},id);
 assert.ok(!p.placement.networks.sewer.some(r=>r.fromId===riser.id));
 assert.ok(p.placement.networks.sewer.some(r=>r.toId===riser.id));
});
