import test from "node:test";
import assert from "node:assert/strict";
import { validateImportedProject } from "../src/react/state/project-import.js";
import { createDefaultProject, migrateProject } from "../src/react/state/project-model.js";

test("unrelated JSON cannot replace an EFT project", () => {
  for (const value of [{ hello: "world" }, [], null, { format: "eft-project" }, { format: "eft-client-brief", plan: {} }])
    assert.throws(() => validateImportedProject(value));
});

test("current and legacy EFT projects still import", () => {
  const current = createDefaultProject();
  assert.equal(migrateProject(validateImportedProject(current)).plan.house.w, current.plan.house.w);
  assert.doesNotThrow(() => migrateProject(validateImportedProject({ estimate: [], params: [] })));
  assert.throws(() => validateImportedProject({ ...current, plan: { house: {}, rooms: "bad" } }), /План/);
  assert.throws(() => validateImportedProject({ ...current, plan: { ...current.plan, house: {} } }), /размеры контура/);
  assert.throws(() => validateImportedProject({ ...current, plan: { ...current.plan, house: { w: -10, h: 8 } } }), /ширину и длину/);
  assert.throws(() => validateImportedProject({ ...current, customEstimateLines: [{ qty: 'Infinity', price: 10 }] }), /Смета/);
  assert.throws(() => validateImportedProject({ ...current, estimateOverrides: [{ qty: -1 }] }), /Смета/);
});
