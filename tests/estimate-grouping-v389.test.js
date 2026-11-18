import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeIdenticalEstimateLines,buildClientEstimate} from '../src/react/calculations/client-estimate.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
const row={id:'a',section:'roof',estimateGroup:'Каркас',catalogId:'wood',name:'Брус 95×145',kind:'material',unit:'м.п.',qty:2,price:100};
test('identical positions consolidate only within the same section and group at the same final price',()=>{
 const rows=[row,{...row,id:'b',qty:3},{...row,id:'c',estimateGroup:'Пол'},{...row,id:'d',section:'sip'},{...row,id:'e',price:90},{...row,id:'f',unit:'м³'},{...row,id:'g',name:'Брус 95×195'}],before=structuredClone(rows);
 const grouped=mergeIdenticalEstimateLines(rows);assert.equal(grouped.length,6);assert.equal(grouped[0].qty,5);assert.deepEqual(grouped[0].includedLineIds,['a','b']);assert.deepEqual(rows,before);
 assert.equal(grouped.reduce((n,r)=>n+r.qty*r.price,0),rows.reduce((n,r)=>n+r.qty*r.price,0));
});
test('default detailed client estimate also combines identical positions and retains source IDs',()=>{
 const c={sections:[{key:'roof',title:'Кровля',lines:[row,{...row,id:'b',qty:'3'}]}]};
 const result=buildClientEstimate(c,{compactAccessories:false});assert.equal(result.sections[0].lines.length,1);assert.equal(result.sections[0].lines[0].qty,5);assert.equal(result.totals.total,500);assert.equal(c.sections[0].lines.length,2);
});
test('panoramic frame members become one material length while physical rows and volume remain unchanged',()=>{
 const p=createDefaultProject();p.plan.facades=[{id:'f',catalogId:''}];p.settings.productionCutting.roofSupports=[3000,2500,1500].map((h,i)=>({id:`f-${i}`,facadeId:'f',type:'post',name:`Фасад · стойка ${i+1}`,profile:'150×150',packageCount:3,estimateEnabled:true,x1:i*1000,y1:0,z1:0,x2:i*1000,y2:0,z2:h}));
 const original=JSON.stringify(p),rows=productionEstimateLines(p),before=structuredClone(rows),result=buildClientEstimate({sections:[{key:'roof',title:'Кровля',lines:rows}]},{compactAccessories:false});
 const line=result.sections[0].lines[0];assert.equal(rows.length,3);assert.equal(result.sections[0].lines.length,1);assert.equal(line.unit,'м.п.');assert.equal(line.qty,rows.reduce((n,r)=>n+r.qty,0));assert.equal(line.name,rows[0].estimateMergeName);assert.equal(line.price,rows[0].price);assert.ok(Math.abs(result.totals.total-rows.reduce((n,r)=>n+r.qty*r.price,0))<1e-8);assert.equal(line.materialVolumeM3,rows.reduce((n,r)=>n+r.materialVolumeM3,0));assert.deepEqual(rows,before);assert.equal(JSON.stringify(p),original);
});
test('a manually renamed or differently priced facade member remains separate',()=>{
 const a={...row,name:'Стойка · 3000 мм',estimateDetailName:'Стойка · 3000 мм',estimateMergeName:'Брус 95×145'};
 const rows=[a,{...a,id:'b',name:'По индивидуальному проекту'},{...a,id:'c',price:120}];
 const grouped=mergeIdenticalEstimateLines(rows);assert.equal(grouped.length,3);assert.equal(grouped[1].name,'По индивидуальному проекту');
});
