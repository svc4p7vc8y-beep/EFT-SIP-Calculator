import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,stockCells} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,facadeLayout,applyFacade,removeFacade} from '../src/react/calculations/facade-design.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {windowGeometry,validateWindow,windowPrice} from '../src/react/state/window-products.js';
import {shapeArea,openingShapeArea} from '../src/calculations/opening-shape.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
import {planIssues} from '../src/react/planner/geometry.js';

function fixture(type='cold'){
  const p=createDefaultProject();
  Object.assign(p.plan,{house:{...p.plan.house,w:8,h:6,points:[],contourDefined:true},wallHeight:2.5,wallThickness:.174,openings:[],rooms:[],walls:[]});
  Object.assign(p.settings.sip,{wallThickness:174,ceilingThickness:174});
  Object.assign(p.settings.roof,{shape:'gable',type,gableCount:2,ridgeAxis:'x',ridgeHeight:2});
  p.settings.productionCutting.roofSupports=[];
  return p;
}
function prepared(type='cold'){
  const p=fixture(type),c=calculateProject(p),r=calculateProductionCutting(p,c);
  const wall=r.surfaces.find(s=>s.exterior&&r.surfaces.some(g=>g.parentWallId===s.id)),e=facadeEnvelope(r,wall.id),f=createFacade(e);
  // Preserve the v362 design as an explicit saved configuration. New v369 templates use the wall plate datum.
  Object.assign(f,{autoClip:false,transomMm:Math.round(e.wall.height*.68),headInsetMm:400,nodeRef:'КР-1: проект соединений',foundationRef:'Ф-1: стойки → ростверк → сваи'});
  return {p,c,r,e,f};
}
test('second-light side wall fills only open-room ceiling band; quantity and cutting agree',()=>{
  const p=fixture();p.plan.rooms=[{id:'open',x:.174,y:.174,w:3,h:3,ceilingMode:'open-rafter'}];
  const c=calculateProject(p),r=calculateProductionCutting(p,c),side=r.surfaces.find(s=>s.id==='Э1-С1');
  assert.equal(side.height,2674);assert.equal(side.blocked,false);
  const off=structuredClone(p);off.plan.secondLightWallFit=false;const old=calculateProject(off);
  assert.ok(c.metrics.exteriorWallGrossArea>old.metrics.exteriorWallGrossArea);
  assert.equal(r.surfaces.find(s=>s.id==='Э1-С2').height,2500,'gable wall is unchanged');
  const parts=r.parts.filter(x=>x.surfaceId===side.id);
  assert.ok(parts.length);assert.ok(parts.every(x=>Math.min(x.width,x.height)>=249.99));
  assert.ok(Math.abs(parts.reduce((s,p)=>s+p.area,0)-shapeArea(side.geometry))<1);
  assert.ok(!r.issues.some(i=>i.target===side.id&&['MEMBER_FIT','MIN_PANEL_WIDTH'].includes(i.code)));
  assert.deepEqual(stockCells(0,2674,2500).map(c=>c.width),[2424,250]);
  const lower=structuredClone(p);lower.services.sipCeiling=false;
  assert.equal(calculateProductionCutting(lower,calculateProject(lower)).surfaces.find(s=>s.id==='Э1-С1').height,2500);
});
test('room manual eave height overrides the automatic ceiling band and survives import',()=>{
  const p=fixture();p.plan.rooms=[{id:'open',x:.174,y:.174,w:3,h:3,ceilingMode:'open-rafter',secondLightEaveHeightMm:2850}];
  const n=migrateProject(JSON.parse(JSON.stringify(p))),r=calculateProductionCutting(n,calculateProject(n));
  assert.equal(r.surfaces.find(s=>s.id==='Э1-С1').height,2850);
});
for(const type of ['cold','sip'])test(`facade ${type}: polygonal glazing spans wall/gable and every SIP area is conserved`,()=>{
  const {p,e,f}=prepared(type);assert.deepEqual(facadeLayout(f,e).errors,[]);
  const n=applyFacade(p,f,e),c=calculateProject(n),r=calculateProductionCutting(n,c),wall=r.surfaces.find(s=>s.id===f.wallId),gable=r.surfaces.find(s=>s.parentWallId===f.wallId);
  assert.equal(wall.blocked,false);assert.equal(gable.blocked,false);
  assert.ok(!planIssues(n.plan).some(i=>i.type==='opening-overlap'),'stacked windows do not collide on the floor plan');
  assert.ok(gable.openings.length>0);assert.ok(n.windowProducts.some(p=>p.shape==='trapezoid_sloped_top'));
  assert.ok(n.windowProducts.every(p=>validateWindow(p).length===0));
  for(const s of [wall,...(type==='sip'?[gable]:[])])assert.ok(Math.abs(r.parts.filter(p=>p.surfaceId===s.id).reduce((sum,p)=>sum+p.area,0)-shapeArea(s.geometry))<1,`${s.id}: no missing or duplicate SIP triangles`);
  const scene=productionScene(r,n),glass=scene.panels.filter(p=>p.windowGlass);
  assert.ok(glass.some(p=>p.placement.layer==='gables'));
  assert.ok(glass.some(p=>p.placement.layer==='walls'));
  assert.ok(glass.flatMap(p=>p.shape.flat()).every(p=>p.every(Number.isFinite)));
  assert.ok(c.roof.mainGableArea<calculateProject(p).roof.mainGableArea);
  assert.ok(n.plan.openings.some(o=>openingShapeArea(o)<o.width*o.height));
  const productArea=n.windowProducts.reduce((s,p)=>s+windowGeometry(p).areaM2,0);
  assert.ok(productArea>0);assert.ok(n.plan.openings.reduce((s,o)=>s+openingShapeArea(o),0)>productArea,'mounting openings are distinct from glazing dimensions');
});
test('facade boards are counted once, have individual cutting rows and preserve existing supports',()=>{
  const {p,e,f}=prepared();p.settings.productionCutting.roofSupports.push({id:'existing',type:'purlin',name:'Прогон',profile:'100×150',nodeRef:'КР-2',x1:1000,y1:3000,z1:4000,x2:5000,y2:3000,z2:4000,startSupport:'',endSupport:''});
  const n=applyFacade(p,f,e),c=calculateProject(n),r=calculateProductionCutting(n,c),layout=facadeLayout(f,e),lines=productionEstimateLines(n);
  assert.ok(n.settings.productionCutting.roofSupports.some(s=>s.id==='existing'));
  assert.equal(lines.filter(l=>l.id.startsWith('production-support-facade:')).length,layout.members.length);
  const expected=layout.members.reduce((s,m)=>s+Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])*f.plies*f.boardWidthMm*f.boardDepthMm/1e9,0);
  assert.ok(Math.abs(lines.filter(l=>l.id.startsWith('production-support-facade:')).reduce((s,l)=>s+l.qty,0)-expected)<.00002);
  assert.equal(r.members.filter(m=>m.source?.startsWith('Фасад · доска')).length,layout.members.length*f.plies);
  assert.ok(r.assembly.supports.filter(s=>s.facadeId===f.id).every(s=>s.loadPath.complete));
  const again=applyFacade(n,f,facadeEnvelope(r,f.wallId));
  assert.equal(again.plan.openings.length,n.plan.openings.length);assert.equal(again.settings.productionCutting.roofSupports.length,n.settings.productionCutting.roofSupports.length);
  const removed=removeFacade(n,f.id,1);assert.equal(removed.plan.openings.length,0);assert.equal(removed.settings.productionCutting.roofSupports.length,1);
});
test('roof support binding can retain coordinates or explicitly snap the endpoint',()=>{
  const {p,e,f}=prepared();p.settings.productionCutting.roofSupports=[{id:'ridge',type:'purlin',name:'Прогон крыши',profile:'100×150',nodeRef:'КР-2',x1:1000,y1:3000,z1:4500,x2:5000,y2:3000,z2:4500,startSupport:'',endSupport:''}];
  f.links=[{supportId:'ridge',end:'end',memberKey:'post-1',snap:false}];
  const n=applyFacade(p,f,e),s=n.settings.productionCutting.roofSupports.find(s=>s.id==='ridge');assert.equal(s.x2,5000);assert.equal(s.endSupport,`facade:${f.id}:post-1`);
  const r=calculateProductionCutting(n,calculateProject(n));assert.ok(r.assembly.issues.some(i=>i.includes('опирание')&&i.includes('не совпадает')));
  f.links[0].snap=true;const snapped=applyFacade(p,f,e),target=snapped.settings.productionCutting.roofSupports.find(item=>item.id===s.endSupport),ridge=snapped.settings.productionCutting.roofSupports.find(item=>item.id==='ridge');
  assert.deepEqual([ridge.x2,ridge.y2,ridge.z2],[target.x2,target.y2,target.z2]);
});
test('facade survives .eft.json migration, undo/redo, and rejects stale envelope',()=>{
  const {p,e,f}=prepared(),n=applyFacade(p,f,e),loaded=migrateProject(JSON.parse(JSON.stringify(n)));
  assert.equal(loaded.plan.facades[0].id,f.id);assert.equal(loaded.windowProducts.length,n.windowProducts.length);
  assert.deepEqual(loaded.plan.openings[0].outline,n.plan.openings[0].outline);
  assert.deepEqual(calculateProject(loaded).totals,calculateProject(n).totals);
  let workspace=createProjectWorkspace(p);workspace=projectWorkspaceReducer(workspace,{type:'commit',tabId:workspace.activeId,update:()=>n});
  workspace=projectWorkspaceReducer(workspace,{type:'undo',tabId:workspace.activeId});assert.equal(workspace.tabs[0].history.present.plan.facades.length,0);
  workspace=projectWorkspaceReducer(workspace,{type:'redo',tabId:workspace.activeId});assert.equal(workspace.tabs[0].history.present.plan.facades.length,1);
  assert.throws(()=>applyFacade(p,{...f,sourceKey:'old'},e),/Контур стены/);
  assert.throws(()=>applyFacade(p,{...f,posts:[1,2]},e),/Стойки/);
});
test('triangular pane geometry and manually specified fasteners/labor stay linked to the facade',()=>{
  const {p,e,f}=prepared('sip');f.windowOverrides={'upper-0':{shape:'triangle',apexPosition:1}};
  f.extras=[{id:'bolts',kind:'material',catalogId:p.priceMat[0].id,qty:12},{id:'assembly',kind:'labor',catalogId:p.priceLab[0].id,qty:2}];
  const n=applyFacade(p,f,e),product=n.windowProducts.find(p=>p.shape==='triangle');assert.ok(product);assert.deepEqual(validateWindow(product),[]);
  const r=calculateProductionCutting(n,calculateProject(n));assert.ok(!r.issues.some(i=>['GABLE_OPENING','OPENING_SIZE','FACADE_STALE'].includes(i.code)));
  assert.equal(n.customEstimateLines.filter(l=>l.facadeId===f.id).length,2);assert.equal(n.customEstimateLines.find(l=>l.kind==='labor').qty,2);
  assert.equal(removeFacade(n,f.id,1).customEstimateLines.length,0);
});
test('price per ready package is not multiplied by the number of boards',()=>{
  const {p,e,f}=prepared();const row={id:'ready-package-test',name:'Готовый пакет по проекту',unit:'м.п.',price:1200};p.priceMat.push(row);
  f.catalogId=row.id;f.packagePricing='package';
  const n=applyFacade(p,f,e),layout=facadeLayout(f,e),lines=productionEstimateLines(n).filter(l=>l.catalogId===row.id);
  const meters=layout.members.reduce((s,m)=>s+Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])/1000,0);
  assert.ok(Math.abs(lines.reduce((s,l)=>s+l.qty,0)-meters)<.00002);
  const report=calculateProductionCutting(n,calculateProject(n));assert.equal(report.members.filter(m=>m.source==='Фасад · готовый пакет').length,layout.members.length);
});
test('post identity survives insertion and deleting a post never rebinds a roof support to its neighbour',()=>{
  const {p,e,f}=prepared();
  const before=facadeLayout(f,e),middle=before.members.find(m=>m.key==='post-1');
  f.posts.push((f.posts[0]+f.posts[1])/2);f.postRefs.push('post-added');
  const inserted=facadeLayout(f,e);assert.deepEqual(inserted.members.find(m=>m.key==='post-1').a,middle.a);
  f.posts.splice(1,1);f.postRefs.splice(1,1);
  assert.ok(!facadeLayout(f,e).members.some(m=>m.key==='post-1'));
});
test('changed facade glazing preserves the old manual quote but excludes it until reviewed',()=>{
  const {p,e,f}=prepared(),n=applyFacade(p,f,e);const product=n.windowProducts[0];product.price={mode:'manual',amountRub:45000,source:'КП поставщика',history:[]};
  f.sillMm+=50;const r=calculateProductionCutting(n,calculateProject(n)),changed=applyFacade(n,f,facadeEnvelope(r,f.wallId)),pane=changed.windowProducts.find(w=>w.id===product.id);
  assert.equal(pane.price.amountRub,45000);assert.equal(pane.geometryPriceReview,true);assert.equal(windowPrice(pane).unitRub,null);
});
