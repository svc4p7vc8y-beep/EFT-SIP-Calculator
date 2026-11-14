import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,applyFacade,facadeLayout} from '../src/react/calculations/facade-design.js';
import {elevationFrame,elevationOpenings,clearElevationWall,editElevationOpening,moveElevationMember} from '../src/react/calculations/elevation-workbench.js';
import {elevationWallKey,elevationAnchors,alignElevation} from '../src/react/calculations/elevation-guides.js';
import {framePost} from '../src/react/calculations/structural-frame.js';
import {createWindowFromReference,WINDOW_REFERENCE,resizeWindowProduct,windowPrice,validateWindow} from '../src/react/state/window-products.js';
import {synchronizeWindowOpening,replaceWindowForOpening} from '../src/react/state/window-opening-link.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
const report=p=>calculateProductionCutting(p,calculateProject(p));
function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:8,h:6,points:[],contourDefined:true},wallHeight:2.5,openings:[],rooms:[],walls:[]});Object.assign(p.settings.roof,{shape:'gable',type:'cold',gableCount:2,ridgeAxis:'x',ridgeHeight:2});p.settings.productionCutting.roofSupports=[];const r=report(p),w=r.surfaces.find(s=>s.exterior&&r.surfaces.some(g=>g.parentWallId===s.id)),e=facadeEnvelope(r,w.id),f=createFacade(e);return {p,r,w,e,f};}

test('367 alignment snaps sill/head, opening edges, stud center and a copied roof guide',()=>{
 const anchors=elevationAnchors({width:6000,height:2500,openings:[{id:'other',x:1000,sill:800,width:1200,height:1200}],guides:[{axis:'x',value:3000},{axis:'slope',a:[0,2500],b:[6000,4500]}]});
 assert.equal(alignElevation({x:3500,z:790,width:1000,height:1200},anchors,15).z,800);
 assert.equal(alignElevation({x:2990,z:0,width:0},anchors,15).x,3000);
 assert.equal(alignElevation({x:2190,z:0,xValues:[2190],zValues:[]},anchors,15).x,2200);
 assert.equal(alignElevation({x:3000,z:3490,width:0,height:0},anchors,15).z,3500);
});

test('367 all 12 quoted constructions retain their reference and scale by actual area',()=>{
 for(const item of WINDOW_REFERENCE.items){const original=createWindowFromReference(item),patch={widthMm:original.widthMm*1.1,...(original.shape==='triangle'?{baseWidthMm:original.widthMm*1.1}:{})},resized=resizeWindowProduct(original,patch),price=windowPrice(resized);
 assert.equal(price.mode,'reference_area',String(item.number));assert.ok(Math.abs(price.unitRub-item.priceRubExact*1.1)<.02);assert.equal(resized.price.baseAmountRub,item.priceRubExact);assert.deepEqual(validateWindow(resized),[]);
 const changed={...resized,sections:resized.sections.map((s,i)=>i? s:{...s,openingMode:s.openingMode==='fixed'?'turn_left':'fixed'})};assert.equal(windowPrice(changed).unitRub,null);
 }
 const manual=createWindowFromReference(WINDOW_REFERENCE.items[1]);manual.price={mode:'manual',amountRub:12345};assert.equal(resizeWindowProduct(manual,{widthMm:1500}).geometryPriceReview,true);assert.equal(manual.price.amountRub,12345);
});

test('367 linked catalog window drives rough opening, report and 3D without moving unrelated geometry',()=>{
 const {p,w}=fixture();p.plan.openings=[{id:'o',type:'window',outer:true,x:0,y:2,width:1,height:1,sillHeight:.8,orientation:'v',angle:90}];const product=createWindowFromReference(WINDOW_REFERENCE.items[1],{openingId:'o'});product.openingId='o';p.windowProducts=[product];const originalHouse=structuredClone(p.plan.house);
 synchronizeWindowOpening(p,product);assert.equal(p.plan.openings[0].width,product.widthMm/1000);assert.equal(p.plan.openings[0].height,product.heightMm/1000);assert.deepEqual(p.plan.house,originalHouse);
 const r=report(p),opening=r.surfaces.flatMap(s=>s.openings||[]).find(o=>o.id==='o');assert.ok(opening?.windowProduct);assert.equal(opening.windowProduct.sections.length,2);assert.ok(productionScene(r,p).panels.some(p=>p.windowGlass));
});

test('367 applied panorama remains visible, reuses manual post ID and preserves roof attachment',()=>{
 const {p,w,e,f}=fixture(),post=framePost(p,w,{x:f.posts[1],height:2500,plies:3,nodeRef:'КР-1'});post.startSupport=post.id+'-foundation';p.settings.productionCutting.roofSupports.push({id:post.startSupport,type:'foundation',profile:'',x1:post.x1,x2:post.x1,y1:post.y1,y2:post.y1,z1:0,z2:0,foundationRef:'Ф-1'},post,{id:'roof',type:'purlin',profile:'100×150',x1:0,y1:0,z1:4500,x2:1000,y2:0,z2:4500,endSupport:post.id});f.postSourceIds={'post-1':post.id};
 const n=applyFacade(p,f,e),r=report(n),wall=r.surfaces.find(s=>s.id===w.id),members=elevationFrame(n,r,wall),openings=elevationOpenings(n,wall);
 assert.equal(n.settings.productionCutting.roofSupports.filter(s=>s.id===post.id).length,1);assert.equal(n.settings.productionCutting.roofSupports.find(s=>s.id==='roof').endSupport,post.id);assert.ok(!n.settings.productionCutting.roofSupports.some(s=>s.id===`facade:${f.id}:post-1`));assert.ok(members.some(m=>m.id===post.id));assert.equal(openings.length,n.plan.openings.length);assert.ok(openings.some(o=>o.sill+o.height>2500));
 const again=applyFacade(n,n.plan.facades[0],facadeEnvelope(r,w.id));assert.equal(again.settings.productionCutting.roofSupports.length,n.settings.productionCutting.roofSupports.length);assert.equal(again.settings.productionCutting.roofSupports.filter(s=>s.id===post.id+'-foundation').length,1);
 const selected=members.find(m=>m.id===post.id),moved=moveElevationMember(n,r,wall,selected,10,10),actual=moved.settings.productionCutting.roofSupports.find(s=>s.id===post.id);assert.equal(actual.z1,post.z1+10);assert.equal(moved.plan.facades[0].posts[1],f.posts[1]+10);assert.equal(facadeLayout(moved.plan.facades[0],e).members.find(m=>m.key==='post-1').a[1],10);
});

test('367 panorama opening movement and resizing stay stable after reapply/import',()=>{
 const {p,w,e,f}=fixture();let n=applyFacade(p,f,e),r=report(n),wall=r.surfaces.find(s=>s.id===w.id),o=elevationOpenings(n,wall)[0];const x=o.x+10,z=o.sill+10,width=o.width-20;
 editElevationOpening(n,wall,o,{x,z,width,height:o.height-20});const raw=n.plan.openings.find(a=>a.id===o.id),expectedX=raw.x,expectedY=raw.y;
 n=applyFacade(n,n.plan.facades[0],facadeEnvelope(report(n),w.id));const loaded=migrateProject(JSON.parse(JSON.stringify(n))),rr=report(loaded),oo=elevationOpenings(loaded,rr.surfaces.find(s=>s.id===w.id)).find(a=>a.id===o.id);
 assert.equal(oo.x,x);assert.equal(oo.sill,z);assert.equal(oo.width,width);assert.ok(Math.abs(loaded.plan.openings.find(a=>a.id===o.id).x-expectedX)<1e-9);assert.ok(Math.abs(loaded.plan.openings.find(a=>a.id===o.id).y-expectedY)<1e-9);
});

test('367 clear only active wall; perimeter retained, guides/settings survive JSON',()=>{
 const {p,w}=fixture(),key=elevationWallKey(w),other=report(p).surfaces.find(s=>s.exterior&&s.id!==w.id),post=framePost(p,w,{x:1000,height:2500,plies:2}),foreign=framePost(p,other,{x:1000,height:2500,plies:2});p.settings.productionCutting.roofSupports.push(post,foreign);
 p.settings.productionCutting.elevationGuides={[key]:[{id:'a',axis:'x',value:1000},{axis:'slope',a:[0,2500],b:[6000,4500]},{axis:'x',value:'invalid'}]};const originalPrice=structuredClone(p.priceMat);const n=clearElevationWall(p,w,[]),loaded=migrateProject(JSON.parse(JSON.stringify(n))),r=report(loaded),members=r.members.filter(m=>m.surfaceId===w.id);
 assert.equal(loaded.settings.productionCutting.elevationGuides[key].length,2);assert.equal(loaded.settings.productionCutting.structuralWallLayouts[key].mode,'manual');assert.ok(!loaded.settings.productionCutting.roofSupports.some(s=>s.id===post.id));assert.ok(loaded.settings.productionCutting.roofSupports.some(s=>s.id===foreign.id));assert.ok(members.some(m=>!m.excluded));assert.ok(members.some(m=>m.excluded));assert.deepEqual(loaded.priceMat,originalPrice);
});

test('367 replacing a linked construction does not leave a second charged window',()=>{
 const p=createDefaultProject();p.plan.openings=[{id:'o',type:'window',x:1,y:0,width:1,height:1}];p.windowProducts=[createWindowFromReference(WINDOW_REFERENCE.items[1],{openingId:'o'}),createWindowFromReference(WINDOW_REFERENCE.items[0])];
 replaceWindowForOpening(p,createWindowFromReference(WINDOW_REFERENCE.items[5],{openingId:'o'}));assert.equal(p.windowProducts.length,2);assert.equal(p.windowProducts.filter(w=>w.openingId==='o').length,1);assert.equal(p.plan.openings[0].width,1.2);assert.equal(p.windowProducts.find(w=>w.openingId==='o').presetId,'273803-6');
});
