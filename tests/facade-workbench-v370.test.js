import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {createFacade,facadeEnvelope,facadeLayout,applyFacade,moveFacadeRow,facadeRowKey,appendFacadeTransom} from '../src/react/calculations/facade-design.js';
import {alignFacadeHandle,elevationFrame,moveElevationMember} from '../src/react/calculations/elevation-workbench.js';
function setup(){const p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:8,h:6,points:[],contourDefined:true},wallHeight:2.5,wallThickness:.174,openings:[],rooms:[],walls:[]});Object.assign(p.settings.roof,{shape:'gable',type:'cold',gableCount:2,ridgeAxis:'x',ridgeHeight:2});p.settings.productionCutting.roofSupports=[];const report=calculateProductionCutting(p,calculateProject(p)),wall=report.surfaces.find(s=>s.exterior&&report.surfaces.some(g=>g.parentWallId===s.id)),e=facadeEnvelope(report,wall.id),f=createFacade(e);f.nodeRef='КР';f.foundationRef='Ф';return {p,e,f,report};}
test('any primary bay handle moves the whole horizontal row; manual geometry outside the facade is retained',()=>{
 const {p,e,f}=setup(),key=facadeLayout(f,e).members.find(m=>m.key.startsWith('header-')).key;
 const next=moveFacadeRow({...f,transomOverrides:{[key]:2200}},key,2500),layout=facadeLayout(next,e);
 assert.equal(facadeRowKey(f,key),'main');assert.ok(layout.members.filter(m=>m.key.startsWith('header-')).every(m=>m.a[1]===2500&&m.b[1]===2500));
 const n=applyFacade(p,next,e);assert.deepEqual(n.priceMat,p.priceMat);assert.deepEqual(n.plan.house,p.plan.house);assert.equal(migrateProject(JSON.parse(JSON.stringify(n))).plan.facades[0].transomMm,2500);
});
test('an extra row moves across all its bays without moving the main row',()=>{
 const {e,f}=setup(),extra=appendFacadeTransom(f,1500),key=facadeLayout(extra,e).members.find(m=>m.transomId).key;
 const next=moveFacadeRow(extra,key,1600),layout=facadeLayout(next,e);assert.equal(next.transomMm,f.transomMm);assert.ok(layout.members.filter(m=>m.transomId).every(m=>m.a[1]===1600&&m.b[1]===1600));
});
test('horizontal row snaps to a user guide and plate centre; its own former height cannot capture it',()=>{
 const {e,f}=setup(),key=facadeLayout(f,e).members.find(m=>m.key.startsWith('header-')).key;
 const plate=alignFacadeHandle(f,e,key,e.mauerlatMm+4,[],10);assert.equal(plate.z,e.mauerlatMm);assert.ok(plate.guides.some(g=>g.label==='Мауэрлат'));
 const guide=alignFacadeHandle(f,e,key,1815,[{axis:'z',value:1800,label:'Пользовательская'}],20);assert.equal(guide.z,1800);
 const old=moveFacadeRow(f,key,1700),free=alignFacadeHandle(old,e,key,1715,[],20);assert.equal(free.z,1715);
});
test('normal elevation beam movement updates every primary segment and matching panes together',()=>{
 const {p,e,f}=setup(),n=applyFacade(p,f,e),r=calculateProductionCutting(n,calculateProject(n)),w=r.surfaces.find(s=>s.id===e.wall.id),member=elevationFrame(n,r,w).find(m=>m.facadeMemberKey?.startsWith('header-'));
 const moved=moveElevationMember(n,r,w,member,0,-100),layout=facadeLayout(moved.plan.facades[0],facadeEnvelope(r,w.id));assert.ok(layout.members.filter(m=>m.key.startsWith('header-')).every(m=>m.a[1]===f.transomMm-100));assert.equal(moved.windowProducts.length,n.windowProducts.length);assert.notDeepEqual(moved.windowProducts.map(w=>w.heightMm),n.windowProducts.map(w=>w.heightMm));
});
