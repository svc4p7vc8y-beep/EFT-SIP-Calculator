import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankPlan, createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { roofRafterControlValues } from '../src/react/calculations/roof-control-values.js';

test('new empty plan keeps roof controls readable without a calculated rafter structure', () => {
  const project = createDefaultProject();
  project.plan = createBlankPlan();
  project.settings.roof.structureMode = 'auto';
  const calculated = calculateProject(project);
  assert.equal(calculated.roof?.rafterStructure, undefined);
  assert.deepEqual(roofRafterControlValues(project.settings.roof, calculated.roof), {
    system: project.settings.roof.rafterSystem,
    step: project.settings.roof.rafterStep,
    section: project.settings.roof.rafterSection,
  });
});

test('automatic roof controls use a computed result when one exists', () => {
  const saved = { structureMode: 'auto', rafterSystem: 'layered', rafterStep: 0.6, rafterSection: '50x150' };
  const computed = { rafterStructure: { system: 'hanging', step: 0.8, section: '50x200' } };
  assert.deepEqual(roofRafterControlValues(saved, computed), { system: 'hanging', step: 0.8, section: '50x200' });
  saved.structureMode = 'manual';
  assert.deepEqual(roofRafterControlValues(saved, computed), { system: 'layered', step: 0.6, section: '50x150' });
});
