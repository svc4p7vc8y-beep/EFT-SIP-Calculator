import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {drawPlanRoofPurlin} from '../src/react/planner/roof-support-plan.js';
import {configureDrawnBearingTruss,expandBearingTrusses} from '../src/react/calculations/bearing-truss.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
import {mergeIdenticalEstimateLines,buildClientEstimate} from '../src/react/calculations/client-estimate.js';

test('drawn truss preserves endpoints, vertical webs and all physical boards after reopen',()=>{
 const p=createDefaultProject(),r=calculateProductionCutting(p,calculateProject(p));
 const ring=r.assembly.floors[0].contour, xs=ring.map(v=>v[0]),ys=ring.map(v=>v[1]);
 const y=(Math.min(...ys)+Math.max(...ys))/2000,a={x:(Math.min(...xs)+500)/1000,y},b={x:(Math.max(...xs)-500)/1000,y};
 const member=configureDrawnBearingTruss(drawPlanRoofPurlin(p,r.assembly.roofModel,a,b),p,r.assembly.roofModel);
 p.settings.productionCutting.roofSupports.push(member);
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),parts=expandBearingTrusses([member]);
 assert.equal(member.x1,Math.round(a.x*1000));assert.equal(member.x2,Math.round(b.x*1000));
 assert.ok(parts.length>5);assert.ok(parts.filter(v=>v.trussRole==='web').every(v=>v.x1===v.x2&&v.y1===v.y2));
 const actual=calculateProductionCutting(restored,calculateProject(restored));
 assert.equal(actual.assembly.supports.filter(v=>v.bearingTrussId===member.id).length,parts.length);
 const rows=productionEstimateLines(restored).filter(v=>v.id.startsWith('production-support-'+member.id+':'));
 assert.equal(rows.length,parts.length);
 const amount=rows.reduce((n,v)=>n+v.qty*v.price,0);
 for(const options of [{},{maximumCompact:true},{superCompact:true}]){
  const estimate=buildClientEstimate({sections:[{key:'roof',title:'Кровля',lines:rows}]},options);
  assert.equal(estimate.sections[0].lines.length,1);assert.ok(Math.abs(estimate.totals.total-amount)<1e-6);
  assert.equal(estimate.sections[0].lines[0].includedLineIds.length,parts.length);
 }
});
test('lumber grouping preserves price, section, group, catalog and manual edits',()=>{
 const a={id:'a',section:'roof',estimateGroup:'Каркас',catalogId:'wood',catalogName:'Доска 50×150 мм',name:'Стойка · 300 мм',kind:'material',unit:'м³',qty:.003,price:26400};
 const rows=[a,{...a,id:'b',name:'Пояс · 6000 мм',qty:.09},{...a,id:'c',price:27000},{...a,id:'d',estimateGroup:'Терраса'},{...a,id:'e',catalogId:'planed'},{...a,id:'f',section:'floor'},{...a,id:'g',catalogName:'Доска 50×100 мм'},{...a,id:'h',custom:true,name:'Индивидуальная деталь'}];
 const before=structuredClone(rows),merged=mergeIdenticalEstimateLines(rows);
 assert.equal(merged.length,7);assert.equal(merged[0].qty,.093);assert.deepEqual(merged[0].includedLineIds,['a','b']);assert.deepEqual(rows,before);
 assert.ok(Math.abs(merged.reduce((n,v)=>n+v.qty*v.price,0)-rows.reduce((n,v)=>n+v.qty*v.price,0))<1e-8);
});
