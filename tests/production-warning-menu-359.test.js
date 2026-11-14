import test from 'node:test';
import assert from 'node:assert/strict';
import {productionViewerWarnings} from '../src/react/calculations/production-diagnostics.js';

const base=()=>({report:{issues:[],assembly:{binding:[]}},scene:{blockers:[],missing:[]},project:{services:{terrace:true}}});
test('one warning retains every highlighted cause without counting the same diagnostic twice',()=>{
 const input=base();input.blockedPreviews=[{id:'wall',reasons:['Проёмы пересекаются']}];
 input.scene.blockers=[{id:'a',surfaceId:'wall',name:'Окно 1',sourceMessage:'Проёмы пересекаются'},{id:'b',surfaceId:'wall',name:'Окно 2',sourceMessage:'Проёмы пересекаются'}];
 const before=JSON.stringify(input),rows=productionViewerWarnings(input);
 assert.equal(rows.length,1);assert.equal(rows[0].message,'Проёмы пересекаются');assert.deepEqual(rows[0].focusTargets.map(t=>t.id),['a','b']);assert.equal(JSON.stringify(input),before);
});
test('the compact menu preserves roof/support warnings, missing geometry and renderer failures',()=>{
 const input=base();assert.equal(productionViewerWarnings(input).length,0);
 input.report.issues=[{code:'SUPPORT_ROOF_INTERSECTION',target:'ОП-5',message:'ОП-5: стойка выше ската'},{code:'SUPPORT_ROOF_INTERSECTION',target:'ОП-6',message:'ОП-6: стойка выше ската'}];
 input.scene.missing=['ПГ-1'];input.roofWarning='Нет скатов';input.error='WebGL недоступен';
 input.scene.parapetRequirement={shortfall:100,provided:200,required:300};
 const rows=productionViewerWarnings(input);assert.equal(rows.length,6);assert.ok(rows.some(r=>r.message==='ОП-5: стойка выше ската'));assert.ok(rows.some(r=>r.message.includes('ПГ-1')));
});
