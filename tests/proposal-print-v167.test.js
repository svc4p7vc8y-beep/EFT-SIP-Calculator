import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';

test('cover overview uses filtered commercial scope before illustrations, empty image editor is not printed', () => {
  const screen=readFileSync(new URL('../src/react/screens/EstimateScreen.jsx',import.meta.url),'utf8');
  assert.ok(screen.indexOf('<ProposalOverview scope={commercialScope}')<screen.indexOf('<PrintProjectDiagrams project='));
  assert.ok(screen.includes("estimateImages.length ? '' : ' no-print'"));
  const p=createDefaultProject(),c=calculateProject(p),saved=JSON.stringify(c.totals);
  const laborOnly={key:'manual',title:'Только работы',lines:[{kind:'labor',qty:1,price:100}]};
  const report={...c,sections:[...c.sections,laborOnly]};
  assert.ok(buildCommercialScope(p,report).some(s=>s.key==='manual'));
  assert.ok(!buildCommercialScope(p,report,{includeLabor:false}).some(s=>s.key==='manual'));
  assert.equal(JSON.stringify(c.totals),saved);
});

test('print sheets do not force trailing pages and large scope can fragment', () => {
  const css=readFileSync(new URL('../src/react/styles/app.css',import.meta.url),'utf8');
  const sheetRules=[...css.matchAll(/\.print-diagrams \.print-diagram-sheet\s*\{([^}]+)\}/g)].map(m=>m[1]).join(' ');
  assert.doesNotMatch(sheetRules,/break-after:\s*(page|always)/);
  assert.match(sheetRules,/break-before:\s*page/);
  assert.match(css,/\.commercial-scope\s*\{\s*break-inside:\s*auto/);
  assert.match(css,/\.print-diagrams:has\(\.print-diagram-sheet\)\s*\{\s*display:\s*block/);
});
