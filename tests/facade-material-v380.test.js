import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {planSupportMaterials} from '../src/react/calculations/plan-support-materials.js';
import {houseFrameMaterial} from '../src/react/calculations/facade-frame-material.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {calculateDeliveryVolume} from '../src/react/calculations/delivery-volume.js';
import {createFacade,facadeEnvelope,applyFacade} from '../src/react/calculations/facade-design.js';

function sample(){const p=createDefaultProject();p.plan.facades=[{id:'f',catalogId:''}];p.settings.productionCutting.roofSupports=[{id:'f-post',facadeId:'f',type:'post',name:'Фасад · стойка',profile:'150×150',packageProfile:'50×150',packageCount:3,packagePricing:'board',estimateCatalogId:'',estimateEnabled:true,referenceOnly:false,nodeRef:'Узел',x1:0,y1:0,z1:0,x2:0,y2:0,z2:3000,startSupport:'',endSupport:''}];return p;}
test('facade uses the same four material families as the house, converting actual volume without changing prices or geometry',()=>{
 for(const type of ['board-pack','board-kit','thermal','solid']){
  const p=sample();p.settings.sip.connectorType=type;const before=JSON.stringify(p),material=houseFrameMaterial(p),line=productionEstimateLines(p)[0];
  assert.ok(material.catalog,type);assert.equal(line.catalogId,material.catalog.id);assert.equal(line.price,material.catalog.price);assert.ok(Math.abs(line.qty-.0675*1e6/material.areaMm2)<.0000011);assert.equal(line.materialVolumeM3,.0675);assert.match(line.source,/эквивалентная длина/);assert.equal(JSON.stringify(p),before);
  const support=planSupportMaterials(p)[0];assert.equal(support.profile,'150×150');assert.equal(support.packageCount,3);assert.equal(support.packagePricing,'package');
 }
});
test('old saved automatic facades follow house material changes and missing prices remain explicit',()=>{
 let p=migrateProject(JSON.parse(JSON.stringify(sample())));assert.equal(productionEstimateLines(p)[0].catalogId,'MAT-187');p.settings.sip.wallThickness=224;assert.equal(productionEstimateLines(p)[0].catalogId,'MAT-188');p.priceMat=p.priceMat.filter(r=>r.id!=='MAT-188');const line=productionEstimateLines(p)[0];assert.equal(line.pricePending,true);assert.equal(line.price,0);assert.equal(line.catalogId,undefined);assert.equal(line.qty,.0675);
});
test('manual facade and individual member material overrides retain their own pricing',()=>{
 const p=sample();p.plan.facades[0].catalogId='MAT-250';p.settings.productionCutting.roofSupports[0].estimateCatalogId='MAT-250';let line=productionEstimateLines(p)[0];assert.equal(line.catalogId,'MAT-250');assert.equal(line.qty,9);assert.equal(line.materialVolumeM3,undefined);
 p.plan.facades[0].catalogId='';assert.equal(productionEstimateLines(p)[0].catalogId,'MAT-250');
});
test('facade delivery uses actual physical volume instead of multiplying equivalent length by the enlarged section',()=>{
 const p=sample(),line=productionEstimateLines(p)[0],result=calculateDeliveryVolume(p,{lines:[line],sections:[{key:'roof',title:'Кровля'}]});assert.ok(JSON.stringify(result).includes('0.0675'));const twice=calculateDeliveryVolume(p,{lines:[{...line,qty:line.qty*2}],sections:[{key:'roof',title:'Кровля'}]});assert.ok(JSON.stringify(twice).includes('0.135'));
});
test('applied facade posts, caps and transoms use house material in cutting and estimate once; reopening keeps all coordinates',()=>{
 let p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:8,h:6,points:[],contourDefined:true},wallHeight:2.5,openings:[],rooms:[],walls:[]});Object.assign(p.settings.roof,{shape:'gable',type:'cold',gableCount:2,ridgeAxis:'x',ridgeHeight:2});p.settings.productionCutting.roofSupports=[];
 let report=calculateProductionCutting(p,calculateProject(p));const wall=report.surfaces.find(s=>s.exterior&&report.surfaces.some(g=>g.parentWallId===s.id)),e=facadeEnvelope(report,wall.id),f=createFacade(e);f.nodeRef='Узел';f.foundationRef='Основание';p=applyFacade(p,f,e);const geometry=JSON.stringify(p.settings.productionCutting.roofSupports);const lines=productionEstimateLines(p);assert.ok(lines.length>3);assert.ok(lines.every(l=>l.catalogId==='MAT-187'&&l.price>0));assert.equal(new Set(lines.map(l=>l.id)).size,lines.length);
 report=calculateProductionCutting(p,calculateProject(p));const members=report.assembly.members.filter(m=>m.source==='Фасад · материал основного каркаса, проектное сечение');assert.equal(members.length,lines.length);assert.ok(members.every(m=>m.material.includes('Пакет клеёных досок')));assert.equal(JSON.stringify(p.settings.productionCutting.roofSupports),geometry);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(productionEstimateLines(restored),lines);
});
