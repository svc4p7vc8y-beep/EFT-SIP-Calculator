import { addBasicEngineeringScheme } from '../src/react/state/engineering-scheme.js';
import { engineeringSettings } from '../src/react/state/engineering-settings.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { createPlacement, normalizePlacement, PLACEMENT_PRESETS } from '../src/react/state/placement-model.js';
import { networkBill, networkLength3d, resolvedNetworkRoutes } from '../src/react/state/placement-networks.js';
import { pipeFittingMarkers } from '../src/react/state/placement-pipe-bill.js';
import { insertPipeElement, removeInlineElement, wallRouteParts, wallContinuations } from '../src/react/state/engineering-wall.js';
let seq=0;const id=()=>`wall-${++seq}`;
const node=(x,y,z=1)=>({id:id(),kind:'cold-outlet',label:'Вывод',layer:'plumbing',floor:1,x,y,height:z,heightKnown:true,width:.14,depth:.12});
function fixture(){const p=createDefaultProject();p.placement=createPlacement();const a=node(1,1),b=node(4,3);p.placement.items.push(a,b);const r={id:id(),floor:1,system:'plumbing',fromId:a.id,toId:b.id,medium:'cold',material:'Полипропилен ПП-R',diameterMm:20,auto:false,routing:'legacy',points:[{x:1,y:1,z:1},{x:4,y:1,z:1},{x:4,y:3,z:1}],accessories:[{name:'Сервисная деталь',quantity:2,unit:'шт'}]};p.placement.networks.plumbing.push(r);return {p,r,a,b};}
test('expanded pipe catalog uses unique stable IDs and declares materials explicitly',()=>{
 assert.equal(new Set(PLACEMENT_PRESETS.map(p=>p.id)).size,PLACEMENT_PRESETS.length);
 for(const kind of ['pp-valve','union','mud-filter','metal-pp-adapter','heat-pp-valve','heat-metal-union'])assert.ok(PLACEMENT_PRESETS.find(p=>p.id===kind));
 assert.equal(PLACEMENT_PRESETS.find(p=>p.id==='pp-valve').connectionMaterial,'pp');
});
test('corner drawings and quantities come from the same pipe topology',()=>{
 const {p,r}=fixture();const markers=pipeFittingMarkers([r],p.placement.items,'plumbing');assert.equal(markers.filter(m=>m.kind==='elbow').length,1);
 const bill=networkBill(p.placement,'plumbing',1,p.plan);assert.equal(bill.components.find(c=>c.name.startsWith('Уголок трубы')).quantity,1);
 const elbow={...node(4,1),kind:'pp-elbow-90',label:'Угол ПП 90°'};p.placement.items.push(elbow);
 assert.equal(pipeFittingMarkers([r],p.placement.items,'plumbing').filter(m=>m.kind==='elbow').length,0);
 assert.equal(networkBill(p.placement,'plumbing',1,p.plan).components.find(c=>c.name==='Угол ПП 90°').quantity,1);
});
test('metal-to-PP adapters appear once per connection and are never guessed for unknown materials',()=>{
 const {p,r,a}=fixture();assert.equal(pipeFittingMarkers([r],p.placement.items,'plumbing').filter(m=>m.kind==='adapter').length,0);
 a.connectionMaterial='metal';a.connectionDiameterMm=15;
 const markers=pipeFittingMarkers([r,r],p.placement.items,'plumbing');assert.equal(markers.filter(m=>m.kind==='adapter').length,1);
 assert.equal(networkBill(p.placement,'plumbing',1,p.plan).components.find(c=>c.name.startsWith('Переход металл–ПП')).quantity,1);
 r.material='PP-R';assert.equal(pipeFittingMarkers([r],p.placement.items,'plumbing').filter(m=>m.kind==='adapter').length,1);
 r.material='Сталь';assert.equal(pipeFittingMarkers([r],p.placement.items,'plumbing').filter(m=>m.kind==='adapter').length,0);
});
test('one continuing pipe has matching markers on both adjoining walls',()=>{
 const a={ref:'a',a:{x:0,y:0},b:{x:4,y:0},length:4},b={ref:'b',a:{x:4,y:0},b:{x:4,y:3},length:3};
 const r={id:'continued',clearanceMm:0,points:[{x:1,y:0,z:1},{x:4,y:0,z:1},{x:4,y:2,z:1}]};
 assert.ok(wallRouteParts(r,a).some(p=>p.index===0));assert.ok(wallRouteParts(r,b).some(p=>p.index===1));
 const first=wallContinuations([r],a,[a,b])[0],second=wallContinuations([r],b,[a,b])[0];assert.equal(first.code,second.code);assert.equal(first.id,second.id);assert.equal(first.nextWall.ref,'b');
 assert.equal(wallRouteParts({points:[{x:1,y:2,z:1},{x:2,y:2,z:1}]},a).length,0);
 assert.equal(wallRouteParts({points:[{x:2,y:-1,z:1},{x:2,y:1,z:1}]},a).length,0);
});
test('inserting and removing an American union preserves total length, profile and accessories',()=>{
 const {p,r}=fixture(),before=networkLength3d(r.points),preset=PLACEMENT_PRESETS.find(p=>p.id==='union');
 const inserted=insertPipeElement(p.placement,'plumbing',r,preset,{x:2,y:1,z:1},id,'outer-0-0');assert.ok(inserted);assert.equal(inserted.connectionDiameterMm,null);
 assert.equal(p.placement.networks.plumbing.length,2);assert.ok(!p.placement.networks.plumbing.some(r=>r.fromId===r.toId));
 assert.equal(p.placement.networks.plumbing.reduce((n,r)=>n+networkLength3d(r.points),0),before);
 assert.equal(p.placement.networks.plumbing.flatMap(r=>r.accessories||[]).reduce((n,a)=>n+a.quantity,0),2);
 assert.ok(p.placement.networks.plumbing.every(r=>r.material==='Полипропилен ПП-R'&&r.diameterMm===20));
 assert.equal(removeInlineElement(p.placement,inserted.id,p.plan).ok,true);assert.equal(p.placement.networks.plumbing.length,1);
 assert.equal(networkLength3d(resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan)[0].points),before);
});
test('insertion into a resolved copy survives JSON reopening and keeps three-dimensional placement',()=>{
 const {p}=fixture(),r=resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan)[0];
 const item=insertPipeElement(p.placement,'plumbing',r,PLACEMENT_PRESETS.find(p=>p.id==='pp-valve'),{x:3,y:1,z:1},id,'outer-0-0');
 const reopened=normalizePlacement(JSON.parse(JSON.stringify(p.placement)));assert.equal(reopened.items.find(i=>i.id===item.id).connectionMaterial,'pp');assert.equal(reopened.items.find(i=>i.id===item.id).height,1);assert.equal(reopened.networks.plumbing.length,2);
});
test('removing a branching fitting or mismatched pipe profiles is blocked without data loss',()=>{
 const {p,r}=fixture(),item=insertPipeElement(p.placement,'plumbing',r,PLACEMENT_PRESETS.find(p=>p.id==='union'),{x:2,y:1,z:1},id);
 p.placement.networks.plumbing[1].material='Медь';let before=structuredClone(p.placement);assert.equal(removeInlineElement(p.placement,item.id,p.plan).ok,false);assert.deepEqual(p.placement,before);
 p.placement.networks.plumbing.push({...p.placement.networks.plumbing[1],id:id()});before=structuredClone(p.placement);assert.equal(removeInlineElement(p.placement,item.id,p.plan).ok,false);assert.deepEqual(p.placement,before);
});
test('a continuation point does not create a purchased fitting or a duplicate elbow',()=>{
 const {p,r}=fixture();insertPipeElement(p.placement,'plumbing',r,{id:'pipe-junction',label:'Точка продолжения'},r.points[1],id);
 const bill=networkBill(p.placement,'plumbing',1,p.plan);assert.ok(!bill.components.some(c=>c.name==='Точка продолжения'));assert.equal(bill.components.find(c=>c.name.startsWith('Уголок трубы')).quantity,1);
});

test('new basic inline nodes share the pipe axis instead of creating spurious branch tees',()=>{
 const p=createDefaultProject();p.placement=createPlacement();addBasicEngineeringScheme(p.placement,p.plan,'plumbing',1,{material:'PP-R',diameterMm:20,clearanceMm:30},id);
 const routes=resolvedNetworkRoutes(p.placement,'plumbing',1,p.plan),markers=pipeFittingMarkers(routes,p.placement.items,'plumbing');
 assert.equal(markers.filter(m=>m.kind==='tee').length,0);assert.equal(markers.filter(m=>m.kind==='elbow').length,0);
 assert.equal(engineeringSettings({clearanceMm:0}).clearanceMm,0);
});

test('legacy fitting nodes can be removed from a line and terminal fittings are not stuck',()=>{
 const {p,r}=fixture(),item=insertPipeElement(p.placement,'plumbing',r,PLACEMENT_PRESETS.find(p=>p.id==='union'),{x:2,y:1,z:1},id);delete item.inlinePipe;
 assert.equal(removeInlineElement(p.placement,item.id,p.plan).ok,true);
 const terminal=node(5,3);terminal.kind='water-valve';p.placement.items.push(terminal);assert.equal(removeInlineElement(p.placement,terminal.id,p.plan).ok,true);
});
