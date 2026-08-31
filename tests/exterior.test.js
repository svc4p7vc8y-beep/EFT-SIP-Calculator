import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { EXTERIOR_TYPES, exteriorGeometry } from '../src/react/calculations/exterior-model.js';
import { changeEstimateLine } from '../src/react/state/estimate-edits.js';
import { buildClientEstimate, unpricedClientLines } from '../src/react/calculations/client-estimate.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';

function projectFor(area = 100) {
  const p = createDefaultProject();
  p.services.externalFinish = true;
  p.settings.links.externalFinishFromPlan = false;
  p.settings.external.facadeArea = area;
  p.settings.external.reserve = 10;
  return p;
}
const ext = p => calculateProject(p).sections.find(s => s.key === 'external')?.lines || [];
const line = (p,key) => ext(p).find(l => l.id === `external:${key}`);

test('every facade option has priced catalog rows and never changes other sections', () => {
  const p = projectFor();
  const before = calculateProject(p).lines.filter(l => l.section !== 'external');
  for (const {value} of EXTERIOR_TYPES) {
    p.settings.external.cladding = value;
    const result = calculateProject(p);
    assert.ok(result.exterior.lines.length > 5);
    assert.ok(result.exterior.lines.every(l => l.catalogId && l.price > 0 && Number.isFinite(l.qty)));
    assert.equal(new Set(result.lines.map(l=>l.id)).size,result.lines.length);
    assert.deepEqual(result.lines.filter(l=>l.section!=='external'),before);
    assert.deepEqual(unpricedClientLines(result),[]);
  }
});
test('50 mm insulation, packs, six-metre lumber and panel purchases round up; labor has no reserve', () => {
  const p = projectFor();
  assert.equal(line(p,'insulation').qty,5.7); // 100 × .05 × 1.1, rounded to .3 m³ packs
  assert.equal(line(p,'insulation-work').qty,100);
  assert.equal(line(p,'wind').qty,2);
  assert.equal(line(p,'siding').qty,131);
  assert.equal(line(p,'siding-work').qty,100);
  assert.equal(line(p,'insulation-frame').qty,.465); // 31 boards × 6 × .05 × .05
});
test('combined areas are shares of one facade and report invalid percentages', () => {
  const p = projectFor(); p.settings.external.cladding='combined';
  p.settings.external.shares={siding:40,wood:30,metal:10,brick:10,bitumen:10};
  const result=calculateProject(p);
  assert.equal(Object.values(result.exterior.areas).reduce((a,b)=>a+b),100);
  assert.equal(line(p,'insulation-work').qty,100);
  assert.equal(line(p,'wood-work').qty,30);
  assert.equal(line(p,'facade-osb').qty,4);
  p.settings.external.shares.wood=60;
  assert.ok(calculateProject(p).exterior.warnings.some(w=>w.includes('130%')));
});
test('wood counts physical profile and work layers and supports different working widths', () => {
  const p=projectFor(10); p.settings.external.cladding='wood';p.settings.external.painting=true;
  assert.equal(line(p,'wood').qty,14*6*.145*.016);
  assert.equal(line(p,'wood-paint').qty,2.64);
  assert.equal(line(p,'wood-paint-work').qty,20);
  const before=line(p,'wood').qty;
  p.settings.external.woodWorkingWidth=100;
  assert.ok(line(p,'wood').qty>before);
  p.settings.external.painting=false;
  assert.equal(line(p,'wood-paint'),undefined);
});
test('outer corners and opening trims use both floors, exclude internal and omitted openings', () => {
  const p=projectFor(); p.plan.house={w:10,h:8};p.plan.wallHeight=3;p.plan.rooms=[];
  p.plan.openings=[{type:'window',outer:true,width:2,height:1.5},{type:'door',outer:true,width:1,height:2},{type:'door',outer:false,width:1,height:2},{type:'window',outer:true,width:10,height:10,include:false}];
  p.meta.floors=2; const upper=structuredClone(p.plan); upper.wallHeight=2.5;upper.openings=[{type:'window',outer:true,width:1,height:1}];p.upperFloors=[upper];
  const g=calculateProject(p).exterior.auto;
  assert.equal(g.outerCornerLength,22);
  assert.equal(g.openingTrimLength,13);
  assert.equal(g.sillLength,3);
  assert.equal(g.startLength,35);
  p.meta.floors=1;
  assert.equal(calculateProject(p).exterior.auto.outerCornerLength,12);
});
test('concave contour counts internal corners irrespective of winding direction', () => {
  const p=projectFor();p.plan.house.points=[{x:0,y:0},{x:8,y:0},{x:8,y:4},{x:4,y:4},{x:4,y:8},{x:0,y:8}];
  const g=calculateProject(p).exterior.auto;
  assert.equal(g.innerCornerLength,2.5);assert.equal(g.outerCornerLength,12.5);
  p.plan.house.points.reverse();
  assert.equal(calculateProject(p).exterior.auto.outerCornerLength,12.5);
});
test('soffit uses horizontal roof footprint minus house, not slope area; manual quantity works', () => {
  const p=projectFor();p.plan.house={w:10,h:8};
  const g=exteriorGeometry(p,{exteriorWallNetArea:90},{geometry:{roofSpan:9,roofLength:11,eaveOverhang:.5,gableOverhang:.5,shape:'gable'}});
  assert.equal(g.soffitArea,19);assert.equal(g.soffitTrimLength,76);
  Object.assign(p.settings.external,{soffitEnabled:true,soffitAuto:false,soffitArea:12,soffitTrimLength:15});
  assert.equal(line(p,'soffit').qty,13.2);assert.equal(line(p,'soffit-work').qty,12);
  p.settings.external.soffitEnabled=false;assert.equal(line(p,'soffit'),undefined);
});
test('outdoor quantities are manual and independent of indoor engineering', () => {
  const p=projectFor();Object.assign(p.settings.external,{outdoorEnabled:true,lights:4,sockets:2,lightingLine:20,socketLine:10,boxes:2,circuits:1});
  const before=calculateProject(p).lines.filter(l=>l.section==='engineering');
  assert.equal(line(p,'lights').qty,4);assert.equal(line(p,'light-cable').qty,22);assert.equal(line(p,'socket-cable').qty,11);
  assert.equal(line(p,'conduit').qty,33);assert.equal(line(p,'electric-route-work').qty,30);
  assert.deepEqual(calculateProject(p).lines.filter(l=>l.section==='engineering'),before);
  p.settings.external.outdoorEnabled=false;assert.equal(line(p,'lights'),undefined);
});
test('old enabled estimates retain their original facade calculation; additions survive serialization', () => {
  const p=projectFor();p.appVersion=113;delete p.settings.external.assemblyVersion;
  p.priceMat.find(i=>i.id==='MAT-105').price=98765;
  p.priceMat=p.priceMat.filter(i=>!i.id.startsWith('EXT-'));p.priceLab=p.priceLab.filter(i=>!i.id.startsWith('EXT-'));
  const restored=migrateProject(p);assert.equal(restored.settings.external.assemblyVersion,0);
  assert.equal(ext(restored).length,5);
  assert.equal(restored.priceMat.find(i=>i.id==='MAT-105').price,98765);
  restored.settings.external.assemblyVersion=1;restored.settings.external.cladding='combined';
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(restored))),restored);
});
test('facade price overrides stay project-local and compact client estimate preserves totals', () => {
  const p=projectFor();const item=line(p,'siding');changeEstimateLine(p,item,{price:555});
  assert.equal(line(p,'siding').price,555);assert.equal(p.priceMat.find(i=>i.id===item.catalogId).price,421);
  const result=calculateProject(p), compact=buildClientEstimate(result,{maximumCompact:true});
  const sum=compact.sections.flatMap(s=>s.lines).reduce((a,l)=>a+l.qty*l.price,0);
  assert.ok(Math.abs(sum-result.totals.total)<.01);
});
test('zero facade does not add framing; manual outdoor and soffit may still be purchased', () => {
  const p=projectFor(0);assert.deepEqual(ext(p),[]);
  Object.assign(p.settings.external,{outdoorEnabled:true,lights:1});assert.equal(line(p,'lights').qty,1);
  p.services.externalFinish=false;assert.deepEqual(ext(p),[]);
});

test('commercial scope and saved project retain the chosen facade and outdoor scope', () => {
  const p=projectFor();Object.assign(p.settings.external,{cladding:'wood',painting:true,outdoorEnabled:true,lights:3,sockets:2,lightingLine:20,socketLine:10,soffitEnabled:true,soffitAuto:false,soffitArea:15,soffitTrimLength:30});
  const restored=migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.settings.external,p.settings.external);
  const scope=buildCommercialScope(restored,calculateProject(restored)).find(item=>item.key==='external');
  assert.ok(scope.summary.includes('Имитация бруса'));
  assert.ok(scope.details.includes('светильники 3'));
  assert.ok(scope.details.includes('подшивка 15'));
  assert.ok(scope.details.includes('покраска'));
});
