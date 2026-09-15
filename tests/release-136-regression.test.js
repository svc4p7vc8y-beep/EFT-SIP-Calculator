import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { createDefaultProject, migrateProject, ensureProjectFloorCount } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildClientEstimate, isEstimateCutting } from '../src/react/calculations/client-estimate.js';
import { createEstimateWorkbook } from '../src/react/export/xlsx.js';

test('Excel respects client options and retains cutting with the same total as the printed estimate', async () => {
  const project = createDefaultProject();
  project.settings.print = { includeLabor: false, includeAccessories: false, maximumCompact: true };
  const calculation = calculateProject(project);
  const client = buildClientEstimate(calculation, project.settings.print);
  const files = unzipSync(new Uint8Array(await createEstimateWorkbook(project, calculation).arrayBuffer()));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /Раскрой/);
  assert.ok(sheet.includes(`<v>${client.totals.total}</v>`));
  assert.ok(!sheet.includes('Монтаж СИП'));
  assert.ok(client.sections.flatMap(s=>s.lines).filter(l=>l.kind==='labor').every(isEstimateCutting));
});

test('legacy missing defaults retain thermobeam and nodes during migration', () => {
  const old = createDefaultProject();
  old.appVersion = 120;
  delete old.settings.sip.connectorType;
  delete old.settings.piles.autoLayoutMode;
  const restored = migrateProject(old);
  assert.equal(restored.settings.sip.connectorType, 'thermal');
  assert.equal(restored.settings.piles.autoLayoutMode, 'nodes');
});

test('roof, floor and connector combinations keep finite totals, unique line IDs and stable save/load results', () => {
  let checked = 0;
  for (const shape of ['gable','hip','flat']) for (const roofType of ['cold','sip'])
  for (const floors of [1,2]) for (const connectorType of ['thermal','board-pack','solid']) {
    const project = createDefaultProject();
    ensureProjectFloorCount(project, floors);
    Object.assign(project.settings.roof,{shape,type:roofType,flatSlopeMode:'structural',flatSlopePercent:3});
    project.settings.sip.connectorType=connectorType;
    const result=calculateProject(project);
    assert.ok(Number.isFinite(result.totals.total));
    assert.equal(new Set(result.lines.map(l=>l.id)).size,result.lines.length);
    for(const line of result.lines){
      assert.ok(Number.isFinite(line.qty) && line.qty>=0, line.id);
      assert.ok(Number.isFinite(line.price) && line.price>=0, line.id);
      assert.ok(line.catalogId, line.id);
    }
    assert.equal(calculateProject(migrateProject(JSON.parse(JSON.stringify(project)))).totals.total,result.totals.total);
    checked++;
  }
  assert.equal(checked,36);
});
