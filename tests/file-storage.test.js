import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared file storage is authenticated and persisted by the server", async () => {
  const [api, schema] = await Promise.all([
    read("server/beget-api/api.php"),
    read("server/beget-api/schema.sql"),
  ]);
  const userGate = api.indexOf("$user = eft_user();");
  for (const action of ["files", "file-folder", "file-upload", "file-download"]) {
    assert.ok(api.indexOf(`$action === '${action}'`) > userGate, `${action} must be after employee authentication`);
  }
  assert.match(schema, /CREATE TABLE IF NOT EXISTS eft_file_folders/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS eft_files/);
  assert.match(schema, /content MEDIUMBLOB NOT NULL/);
  assert.match(api, /eft_questionnaire_attachments a JOIN eft_questionnaires/);
  assert.match(api, /Размер одного файла не должен превышать 8 МБ/);
});

test("the Files screen replaces the persistent questionnaire banner", async () => {
  const [app, screen] = await Promise.all([
    read("src/react/app/App.jsx"),
    read("src/react/screens/FilesScreen.jsx"),
  ]);
  assert.match(app, /id: "files", label: "Файлы"/);
  assert.match(app, /active === "files"/);
  assert.doesNotMatch(app, /className="project-source-files/);
  assert.match(screen, /Новая папка/);
  assert.match(screen, /file-upload/);
  assert.match(screen, /Файлы из анкет/);
  assert.match(screen, /multiple/);
});
