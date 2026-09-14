import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mail credentials stay in an ignored server-only file", async () => {
  const [client, workflow, htaccess] = await Promise.all([
    read("server/beget-api/mail-client.php"),
    read(".github/workflows/beget-mail-configure.yml"),
    read("server/beget-api/.htaccess"),
  ]);
  assert.match(client, /mail\.local\.php/);
  assert.match(workflow, /secrets\.EFT_MAIL_APP_PASSWORD/);
  assert.doesNotMatch(workflow, /password'\s*=>\s*'[^']{4,}'/);
  assert.match(htaccess, /mail\(\?:\\\.local\|\\\.example\)\?/);
});

test("mail API requires employee session and CSRF for writes", async () => {
  const api = await read("server/beget-api/api.php");
  const userGate = api.indexOf("$user = eft_user();");
  for (const action of ["mail-status", "mail-messages", "mail-message", "mail-attachment", "mail-send", "mail-link"]) {
    assert.ok(api.indexOf(`$action === '${action}'`) > userGate, `${action} must be after employee authentication`);
  }
  assert.ok(api.indexOf("eft_csrf();") < api.indexOf("$action === 'mail-send'"));
  assert.ok(api.indexOf("eft_csrf();") < api.indexOf("$action === 'mail-link'"));
});

test("mail links are persisted without copying mailbox contents", async () => {
  const schema = await read("server/beget-api/schema.sql");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS eft_mail_links/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS eft_mail_(?:messages|attachments)/);
});
