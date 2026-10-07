import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionValues, structuralDimensions, surfaceDimensions, bearingPlanWidth } from '../src/react/calculations/drawing-dimensions.js';
import { SIP_REFERENCE_SCHEMES, SIP_REFERENCE_SOURCES, referenceSchemeMatches } from '../src/react/data/sip-reference-schemes.js';

test('drawing dimensions retain small segments and remove invalid coordinates',()=>{
  assert.deepEqual(dimensionValues([0,25,50,625,625.1,NaN,null,'',Infinity]),[0,25,50,625]);
});
test('house dimensions do not include roof overhangs or remote supports',()=>{
  const assembly={axis:'x',floors:[{contour:[[100,200],[8100,200],[8100,6200],[100,6200]]}],
    roofOutline:[[-400,-300],[8600,-300],[8600,6700],[-400,6700]],
    rafters:[{a:[100,-300],b:[100,3200]},{a:[8100,-300],b:[8100,3200]}],
    supports:[{a:[-10000,0],b:[0,0]}],piles:[[100,200],[4100,200],[8100,6200]],binding:[]};
  const saved=JSON.stringify(assembly),d=structuralDimensions(assembly);
  assert.deepEqual(d.house,{x:100,y:200,width:8000,height:6000});
  assert.deepEqual(d.roof,{x:-400,y:-300,width:9000,height:7000});
  assert.deepEqual(structuralDimensions(assembly,true).x,[100,4100,8100]);
  assert.equal(JSON.stringify(assembly),saved);
});
test('drawing wall depth comes from second profile dimension, not board thickness',()=>{
  for(const profile of ['50×200','50x200','50х200'])assert.equal(bearingPlanWidth(profile),200);
  assert.equal(bearingPlanWidth(''),null);assert.equal(bearingPlanWidth('50×0'),null);
});
test('opening dimension chains include sill, head, jambs and wall extent',()=>{
  const surface={geometry:[[[[0,0],[6000,0],[6000,2800],[0,2800],[0,0]]]],openings:[{x:1000,width:1200,sill:850,height:1400},{x:4000,width:900,sill:0,height:2100}]};
  const d=surfaceDimensions(surface,[],[{a:[25,50],b:[25,2700]},{a:[5975,50],b:[5975,2700]}]);
  assert.deepEqual(d.openingX,[0,1000,2200,4000,4900,6000]);
  assert.deepEqual(d.openingY,[0,850,2100,2250,2800]);
  assert.deepEqual(d.x,[0,25,5975,6000]);
});
test('reference schemes cite valid source pages without claiming new confirmed norms',()=>{
  assert.equal(new Set(SIP_REFERENCE_SCHEMES.map(s=>s.id)).size,SIP_REFERENCE_SCHEMES.length);
  for(const s of SIP_REFERENCE_SCHEMES){assert.equal(s.status,'reference');assert.equal(s.labels.length,4);assert.ok(s.current&&s.limits);assert.ok(s.pages.every(p=>Number.isInteger(p)&&p>0&&p<=SIP_REFERENCE_SOURCES[s.source].pages));}
  assert.ok(referenceSchemeMatches(SIP_REFERENCE_SCHEMES[0],'авАДо'));
  assert.equal(referenceSchemeMatches(SIP_REFERENCE_SCHEMES[0],'','confirmed'),false);
  assert.equal(referenceSchemeMatches(SIP_REFERENCE_SCHEMES[0],'неизвестное'),false);
});
