import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const planSource = readFileSync(new URL('../src/react/screens/PlanScreen.jsx', import.meta.url), 'utf8');
const parametersSource = readFileSync(new URL('../src/react/screens/ParametersScreen.jsx', import.meta.url), 'utf8');
const normalizedParametersSource = parametersSource.replace(/\r/g, '');
const supportsSource = readFileSync(new URL('../src/react/screens/PlanRoofSupports.jsx', import.meta.url), 'utf8');

test('plan inspector groups contextual controls in their domain sections', () => {
  assert.match(planSource, /partitionPlanControls=/);
  assert.match(planSource, /roofPlanControls=/);
  assert.match(planSource, /productionPlanControls=/);
  assert.doesNotMatch(planSource, /CalculationSettingsPanel/);
  assert.doesNotMatch(planSource, /className="bearing-selection-controls"/);
  assert.match(planSource, /hideSectionJump/);
});

test('partition construction settings are separated from SIP and ordered before roof', () => {
  const sip = normalizedParametersSource.indexOf('<Section\n            id="sip"');
  const partitions = normalizedParametersSource.indexOf('<Section\n            id="partitions"', sip);
  const roof = normalizedParametersSource.indexOf('<Section\n            id="roof"', partitions);
  assert.ok(sip >= 0 && partitions > sip && roof > partitions);

  const sipSection = normalizedParametersSource.slice(sip, partitions);
  const partitionSection = normalizedParametersSource.slice(partitions, roof);
  assert.doesNotMatch(sipSection, /settings\.sip\.partitionType/);
  assert.match(partitionSection, /settings\.sip\.partitionType/);
  assert.match(partitionSection, /plan\.partitionThickness/);
});

test('roof supports can render inside the roof parameter section', () => {
  assert.match(supportsSource, /embedded=false/);
  assert.match(supportsSource, /return embedded\?controls:/);
  assert.match(parametersSource, /id="roof"[\s\S]*?\{roofPlanControls\}/);
  assert.match(parametersSource, /id="production"[\s\S]*?\{productionPlanControls\}/);
});
