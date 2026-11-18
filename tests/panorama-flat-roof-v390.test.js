import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,polygonAreaMm} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,facadeLayout,applyFacade,fullHeightFacade,facadeReservedShape,moveFacadeTransom} from '../src/react/calculations/facade-design.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {wallHeightStockNote} from '../src/react/calculations/production-diagnostics.js';
import {roofCoverLayout} from '../src/react/calculations/roof-cover-layout.js';

const report=p=>calculateProductionCutting(p,calculateProject(p));
function sample(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:3,contourDefined:true,points:[{x:0,y:0},{x:0,y:3},{x:6,y:3},{x:6,y:0}]},wallHeight:2.7,openings:[],rooms:[],walls:[]});Object.assign(p.settings.roof,{shape:'flat',type:'sip',flatSlopeMode:'tapered',flatSlopePercent:9.8,flatSlopeDirection:'back'});p.settings.productionCutting.minPanelWidthMm=10;let r=report(p),e=facadeEnvelope(r,'Э1-С2'),f=createFacade(e);Object.assign(f,{posts:[80,5920],postRefs:['left','right'],sillMm:50,transomMm:2700,headInsetMm:300});return applyFacade(p,f,e);}

test('panoramic jamb mounting joints do not become five millimetre SIP strips or mutate saved framing',()=>{
 const p=sample(),before=JSON.stringify(p),total=calculateProject(p).totals.total,r=report(p),wall=r.surfaces.find(s=>s.id==='Э1-С2');
 assert.equal(wall.blocked,false);assert.ok(!r.issues.some(i=>i.code==='MIN_PANEL_WIDTH'&&i.target===wall.id));
 assert.ok(!wall.geometry.some(poly=>{const xs=poly.flat().map(p=>p[0]);return Math.max(...xs)-Math.min(...xs)<10;}));
 assert.equal(JSON.stringify(p),before);assert.equal(calculateProject(p).totals.total,total);
});

test('mounting pockets preserve real wall piers, horizontal members and independent facade groups',()=>{
 const post=(x)=>[[[x,0],[x+150,0],[x+150,2700],[x,2700]]];
 const p={facades:[{id:'f',wallId:'w',widthMm:6000,clearanceMm:30,memberShapes:[post(40),post(5810)]}]};
 const a=facadeReservedShape(p,'w');assert.equal(a.reduce((s,p)=>s+polygonAreaMm(p),0),2*150*2700);assert.deepEqual(facadeReservedShape(p,'other'),[]);
});

test('full-height glazing is explicit, keeps all posts, removes the intermediate header and survives reopening',()=>{
 const p=sample(),r=report(p),e=facadeEnvelope(r,'Э1-С2'),old=p.plan.facades[0],f=fullHeightFacade(old),layout=facadeLayout(f,e);
 assert.equal(old.fullHeight,undefined);assert.deepEqual(f.posts,old.posts);assert.equal(layout.errors.length,0);assert.equal(layout.windows.length,1);assert.ok(layout.windows[0].height>2400);
 assert.ok(!layout.members.some(m=>m.key.startsWith('header-')));assert.ok(layout.members.filter(m=>m.type==='post').every(m=>m.b[1]<=2700));
 const applied=applyFacade(p,f,e),restored=migrateProject(JSON.parse(JSON.stringify(applied))),rr=report(restored),wall=rr.surfaces.find(s=>s.id==='Э1-С2');
 assert.equal(restored.plan.facades[0].fullHeight,true);assert.equal(wall.blocked,false);assert.deepEqual(wall.geometry,[]);assert.equal(applied.plan.openings.filter(o=>o.facadeId===f.id).length,1);
 assert.equal(moveFacadeTransom(f,'main',1800).fullHeight,false);
});

test('tapered SIP roof shares sloping exterior geometry with drawings while the SIP base stays level',()=>{
 const p=sample(),r=report(p),face=r.assembly.roofModel.faces.find(f=>f.group==='main'),scene=productionScene(r,p),base=scene.panels.find(p=>p.layer==='roof'),cover=scene.panels.find(p=>p.layer==='sheetCover');
 assert.equal(r.assembly.roofDrawing.model,r.assembly.roofModel);assert.ok(Math.abs(face.slopePercent-9.8)<1e-8);assert.equal(base.placement.u[2],0);assert.equal(base.placement.v[2],0);assert.ok(Math.abs(cover.placement.u[2])+Math.abs(cover.placement.v[2])>.01);
 const sheets=roofCoverLayout(r.assembly,{usefulWidth:1000,grossWidth:1100,stockLength:4000,overlap:100});assert.ok(sheets.slopes.length>0);assert.equal(sheets.slopes[0].faceId,face.id);
 assert.ok(r.issues.filter(i=>i.code==='ROOF_LAYOUT_ESTIMATE').every(i=>!i.message.includes('undefined')),'real stock/estimate discrepancies remain explicit and numeric');
});

test('wall top additions explain the stock-length difference and disappear with an explicitly longer panel',()=>{
 const p=sample(),r=report(p),wall=r.surfaces.find(s=>s.exterior&&s.id!=='Э1-С2');
 assert.match(wallHeightStockNote(r,wall),/2700 мм.*2500 мм/);assert.match(wallHeightStockNote(r,wall),/200 мм/);assert.equal(wall.height,2700);
 p.settings.formulas.panelLength=2.8;const rr=report(p),ww=rr.surfaces.find(s=>s.id===wall.id);assert.equal(ww.height,2700);assert.equal(wallHeightStockNote(rr,ww),'');
});
