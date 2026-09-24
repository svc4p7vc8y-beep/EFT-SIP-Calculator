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
  assert.match(workflow, /secrets\.EFT_SALE_MAIL_APP_PASSWORD/);
  assert.match(workflow, /'username' => 'sale@eftsip\.ru'/);
  assert.ok(workflow.indexOf("Verify new mailbox credentials") < workflow.indexOf("Upload private configuration"));
  assert.match(workflow, /inbox\.login\(address, password\)/);
  assert.match(workflow, /smtp\.login\(address, password\)/);
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

test("mail screen displays the mailbox returned by the server", async () => {
  const screen = await read("src/react/screens/MailScreen.jsx");
  assert.match(screen, /status\?\.address \|\| "sale@eftsip\.ru"/);
  assert.match(screen, /Почта \{mailboxAddress\}/);
  assert.doesNotMatch(screen, /info@eftsip\.ru/);
});

test("questionnaire deletion is admin-only, password-confirmed and recoverable", async () => {
  const api = await read("server/beget-api/api.php");
  assert.match(api, /\$action === 'intake-delete'/);
  assert.match(api, /eft_require_role\(\['admin'\]\)/);
  assert.match(api, /password_verify\(\$password, \$hash\)/);
  assert.match(api, /UPDATE eft_questionnaires SET status = 'archived'/);
  assert.match(api, /'intake_archived'/);
});

test("employee edits require administrator reauthentication and invalidate changed sessions", async () => {
  const [api, bootstrap] = await Promise.all([read('server/beget-api/api.php'), read('server/beget-api/bootstrap.php')]);
  const start = api.indexOf("$action === 'user-update'");
  assert.ok(start > api.indexOf('$user = eft_user();'));
  const update = api.slice(start);
  assert.match(update, /eft_require_role\(\['admin'\]\)/);
  assert.match(update, /password_verify\(\$adminPassword/);
  assert.match(update, /password_hash\(\$newPassword, PASSWORD_DEFAULT\)/);
  assert.match(update, /self_lockout/);
  assert.match(update, /last_admin/);
  assert.match(update, /'user_updated'/);
  assert.doesNotMatch(update, /'newPassword'\s*=>\s*\$newPassword/);
  assert.match(bootstrap, /function eft_session_user/);
  assert.match(bootstrap, /hash_equals\(eft_session_tag\(\$row\)/);
});

test("mail links are persisted without copying mailbox contents", async () => {
  const [schema, client] = await Promise.all([
    read("server/beget-api/schema.sql"),
    read("server/beget-api/mail-client.php"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS eft_mail_links/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS eft_mail_(?:messages|attachments)/);
  assert.match(client, /\$address \. ':' \. \$mailbox \. ':' \. \$uid/);
  assert.match(client, /if \(\$address === 'info@eftsip\.ru'\)/);
});

test("public applications use authenticated SMTP and expose notification failures", async () => {
  const [bootstrap, api, site, questionnaire] = await Promise.all([
    read("server/beget-api/bootstrap.php"),
    read("server/beget-api/api.php"),
    read("src/site/Site.jsx"),
    read("src/questionnaire/main.jsx"),
  ]);
  assert.match(bootstrap, /eft_send_smtp\(\$recipient, \$subject/);
  assert.match(bootstrap, /\$mailConfig\['username'\] \?\? 'sale@eftsip\.ru'/);
  assert.doesNotMatch(bootstrap, /@mail\(/);
  assert.match(site, /result\.mailAccepted/);
  assert.match(questionnaire, /result\.mailAccepted/);
  assert.match(api, /eft_normalize_phone/);
  assert.match(api, /\$name === '' \|\| \$phone === null/);
  assert.match(api, /\$input\['customer'\]\['phone'\] = \$phone/);
  assert.match(api, /\$input\['phone'\] = \$phone/);
  assert.doesNotMatch(api, /!empty\(\$input\['website'\]\)/);
  assert.doesNotMatch(site, /name="website"/);
});
