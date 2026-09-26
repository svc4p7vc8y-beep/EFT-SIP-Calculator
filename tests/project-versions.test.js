import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject } from "../src/react/state/project-model.js";
import { getSavedProjectVersion, restoreSavedProjectVersion } from "../src/react/cloud/project-versions.js";

test("restoring a server version checkpoints the current project first", async () => {
  const calls = [];
  const oldProject = createDefaultProject();
  oldProject.meta.customer = "Старый";
  const currentProject = createDefaultProject();
  currentProject.meta.customer = "Текущий";
  const api = async (action, options) => {
    calls.push({ action, options });
    if (action === "version") return { version: { project_id: "p1", revision: 2, payload: oldProject } };
    if (options.method === "PUT") return { revision: calls.length === 3 ? 8 : 9 };
    return { project: { revision: 7, payload: currentProject } };
  };
  await restoreSavedProjectVersion(api, "p1", 25, "csrf-token");
  assert.deepEqual(calls.map((call) => `${call.action}:${call.options.method || "GET"}`), ["version:GET", "project:GET", "project:PUT", "project:PUT"]);
  assert.equal(calls[2].options.body.payload.meta.customer, "Текущий");
  assert.equal(calls[2].options.body.checkpoint, true);
  assert.equal(calls[3].options.body.revision, 8);
  assert.equal(calls[3].options.body.payload.meta.customer, "Старый");
});

test("a version from another project is rejected before writing", async () => {
  const api = async () => ({ version: { project_id: "other", payload: createDefaultProject() } });
  await assert.rejects(getSavedProjectVersion(api, "p1", 1), /не принадлежит/);
});
