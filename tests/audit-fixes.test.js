import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeLibraryEntries } from "../src/react/cloud/library-sync.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function block(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test("switching projects creates a checkpoint before replacing current work", async () => {
  const app = await read("src/react/app/App.jsx");
  const imported = block(app, "const importProject", "const importClientBrief");
  const created = block(app, "const createNewProject", "const saveProject");
  const opened = block(app, "const openTeamProject", "const importTeamIntake");
  assert.ok(imported.indexOf("checkpoint()") < imported.indexOf("replace(imported)"));
  assert.ok(created.indexOf("checkpoint()") < created.indexOf("team.createProject"));
  assert.ok(opened.indexOf("checkpoint()") < opened.indexOf("team.openProject"));
});

test("library conflict merge keeps distinct entries and the newest shared ID", () => {
  const local = [
    { id: "local", savedAt: "2026-09-26T10:00:00Z" },
    { id: "same", updatedAt: "2026-09-26T12:00:00Z", title: "local-new" },
  ];
  const remote = [
    { id: "remote", savedAt: "2026-09-26T11:00:00Z" },
    { id: "same", updatedAt: "2026-09-26T09:00:00Z", title: "remote-old" },
  ];
  const merged = mergeLibraryEntries(local, remote);
  assert.deepEqual(new Set(merged.map((item) => item.id)), new Set(["local", "remote", "same"]));
  assert.equal(merged.find((item) => item.id === "same").title, "local-new");
});

test("shared libraries use optimistic revisions and report conflicts", async () => {
  const [context, api] = await Promise.all([
    read("src/react/cloud/TeamContext.jsx"),
    read("server/beget-api/api.php"),
  ]);
  assert.match(context, /body: \{ key, revision, payload \}/);
  assert.match(context, /revision_conflict/);
  assert.match(context, /setInterval[\s\S]*syncLibraries/);
  assert.match(api, /SELECT revision FROM eft_shared_documents[^;]+FOR UPDATE/);
  assert.match(api, /currentRevision/);
});

test("mail reads, MIME decoding and intake links are protected", async () => {
  const [api, mail, context] = await Promise.all([
    read("server/beget-api/api.php"),
    read("server/beget-api/mail-client.php"),
    read("src/react/cloud/TeamContext.jsx"),
  ]);
  assert.match(api, /mail-message'[\s\S]*eft_mail_message\(\$uid, false/);
  assert.match(api, /mail-message-read'[\s\S]*eft_mail_message\(\$uid, true/);
  assert.match(mail, /eft_decode_mail_body_charset/);
  assert.match(mail, /5 => 'image'/);
  assert.match(api, /intake-read'[\s\S]*'newlyRead' => \$newlyRead/);
  assert.match(context, /if \(result\.newlyRead\)/);
  assert.doesNotMatch(block(api, "if ($action === 'intake-status'", "if ($action === 'shared'"), /\['reviewed', 'imported', 'archived'\]/);
  assert.match(api, /project_not_found/);
});

test("login rate limiting and deployment coverage are present", async () => {
  const [api, schema, calculatorWorkflow, migrationWorkflow] = await Promise.all([
    read("server/beget-api/api.php"),
    read("server/beget-api/schema.sql"),
    read(".github/workflows/beget.yml"),
    read(".github/workflows/beget-api-migrate.yml"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS eft_login_attempts/);
  assert.match(api, /eft_login_rate_blocked/);
  assert.match(api, /failures >= 8/);
  assert.match(calculatorWorkflow, /- 'src\/\*\*'/);
  assert.match(calculatorWorkflow, /- 'package-lock\.json'/);
  assert.match(migrationWorkflow, /find server\/beget-api -type f -name '\*\.php'/);
});
