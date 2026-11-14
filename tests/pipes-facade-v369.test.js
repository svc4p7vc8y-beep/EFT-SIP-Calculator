import test from 'node:test';
import assert from 'node:assert/strict';
import {orthogonalWallPath} from '../src/react/state/placement-pipe-routing.js';
import {moveEngineeringGroup} from '../src/react/state/engineering-snap.js';
import {createPlacement,normalizePlacement} from '../src/react/state/placement-model.js';
import {connectionPortsFor} from '../src/react/state/placement-connections.js';
import {pipeFittingMarkers} from '../src/react/state/placement-pipe-bill.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,facadeLayout,applyFacade,moveFacadeTransom,appendFacadeTransom} from '../src/react/calculations/facade-design.js';
import {windowGeometry,validateWindow} from '../src/react/state/window-products.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
const wall={ref:'outer-0-0',a:{x:0,y:0},b:{x:6,y:0},length:6,normal:{x:0,y:1}};
test('wall pipe has only requested station range and exact endpoints, including a rotated wall',()=>{
 for(const w of [wall,{...wall,a:{x:2,y:1},b:{x:2,y:7},normal:{x:-1,y:0}}]){
  const at=(s,z)=>({x:w.a.x+(w.b.x-w.a.x)/6*s+w.normal.x*.03,y:w.a.y+(w.b.y-w.a.y)/6*s+w.normal.y*.03,z});
  const anchors=[at(.8,.4),at(1.6,.4),at(1.6,1.5),at(2.2,1.5)],path=orthogonalWallPath(anchors,w);
  assert.deepEqual(path,anchors);assert.deepEqual(orthogonalWallPath([at(1,.5),at(2,1.5)],w),[at(1,.5),at(2,.5),at(2,1.5)]);
  assert.equal(orthogonalWallPath([at(-1,.5),at(2,1.5)],w),null);
 }
});
test('corner symbols carry actual directions without changing fitting quantities',()=>{
 const points=[{x:1,y:.03,z:1},{x:2,y:.03,z:1},{x:2,y:.03,z:2}];
 const markers=pipeFittingMarkers([{id:'r',medium:'cold',material:'Полипропилен PP-R',diameterMm:20,points}],[],'plumbing');
 assert.equal(markers.length,1);assert.equal(markers[0].kind,'elbow');assert.deepEqual(markers[0].directions,[[-1,0,0],[0,0,1]]);
});
test('Ctrl group moves each appliance/outlet once and internal pipe bends follow; save/reopen retains coordinates',()=>{
 const d=createPlacement(),a={id:'a',kind:'water-heater',label:'Бойлер',floor:1,layer:'plumbing',x:1,y:.03,height:1,width:.5,depth:.4,wallRef:wall.ref,displayPlane:'wall'},b={...a,id:'b',x:3};
 d.items=[a,...connectionPortsFor(a,wall),b,...connectionPortsFor(b,wall)];const before=structuredClone(d.items),ports=d.items.filter(i=>i.kind==='connection-port');
 d.networks.plumbing=[{id:'r',fromId:ports[0].id,toId:ports.at(-1).id,points:[{x:1,y:.03,z:.5},{x:2,y:.03,z:.5},{x:3,y:.03,z:1}]}];
 moveEngineeringGroup(d,['a','b'],{x:.25,y:0,z:.2},null);
 for(const item of d.items){const old=before.find(i=>i.id===item.id);assert.ok(Math.abs(item.x-old.x-.25)<1e-8);assert.ok(Math.abs(item.height-old.height-.2)<1e-8);}
 assert.equal(d.networks.plumbing[0].points[1].x,2.25);assert.equal(d.networks.plumbing[0].points[1].z,.7);
 const restored=normalizePlacement(JSON.parse(JSON.stringify(d)));assert.equal(restored.items.find(i=>i.id==='a').x,1.25);
});
function prepared(type){const p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:8,h:6,points:[],contourDefined:true},wallHeight:2.5,wallThickness:.174,openings:[],rooms:[],walls:[]});Object.assign(p.settings.roof,{shape:'gable',type,gableCount:2,ridgeAxis:'x',ridgeHeight:2});p.settings.productionCutting.roofSupports=[];const r=calculateProductionCutting(p,calculateProject(p)),wall=r.surfaces.find(s=>s.exterior&&r.surfaces.some(g=>g.parentWallId===s.id)),e=facadeEnvelope(r,wall.id),f=createFacade(e);return{p,r,e,f};}
for(const type of ['cold','sip'])test(`new ${type} facade: plate datum, additional movable transoms, panes and 3D survive calculation and reopening`,()=>{
 const {p,r,e,f}=prepared(type);assert.equal(f.transomMm,Math.round(e.mauerlatMm));if(type==='cold')assert.ok(e.mauerlatSource);assert.notEqual(f.transomMm,Math.round(e.wall.height*.68));
 f.nodeRef='КР-1';f.foundationRef='Ф-1';let layout=facadeLayout(f,e);assert.deepEqual(layout.errors,[]);
 const initial=applyFacade(p,f,e),initialArea=initial.windowProducts.reduce((sum,w)=>sum+windowGeometry(w).areaM2,0);
 f.windowOverrides={'lower-0':{widthMm:500,heightMm:500,templateId:'fixed'}};
 const added=appendFacadeTransom(f,1500),moved=moveFacadeTransom(added,`transom:${added.transoms[0].id}`,1600);
 assert.equal(moved.windowOverrides['lower-0'].widthMm,undefined);assert.equal(moved.windowOverrides['lower-0'].templateId,'fixed');
 layout=facadeLayout(moved,e);assert.deepEqual(layout.errors,[]);assert.equal(layout.members.filter(m=>m.transomId).length,2);
 const n=applyFacade(p,moved,e),report=calculateProductionCutting(n,calculateProject(n));assert.ok(n.windowProducts.length>initial.windowProducts.length);assert.ok(n.windowProducts.every(w=>!validateWindow(w).length));assert.ok(n.windowProducts.reduce((sum,w)=>sum+windowGeometry(w).areaM2,0)<initialArea);
 assert.ok(productionScene(report,n).panels.some(p=>p.windowGlass));assert.equal(migrateProject(JSON.parse(JSON.stringify(n))).plan.facades[0].transoms[0].zMm,1600);
 const repeat=applyFacade(n,moved,facadeEnvelope(report,moved.wallId));assert.equal(repeat.plan.openings.length,n.plan.openings.length);assert.deepEqual(n.priceMat,p.priceMat);
});
