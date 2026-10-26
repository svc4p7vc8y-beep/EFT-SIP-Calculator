<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/price-catalog.php';
$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(404); exit; }
    $provided = (string)($_SERVER['HTTP_X_EFT_SETUP_TOKEN'] ?? '');
    if ($provided === '' || !hash_equals((string)(eft_config()['setup_token'] ?? ''), $provided)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'message' => 'Forbidden']);
        exit;
    }
}
$pdo = eft_db();
$schema = file_get_contents(__DIR__ . '/schema.sql');
foreach (preg_split('/;\s*(?:\r?\n|$)/', (string)$schema) as $statement) {
    $statement = trim($statement);
    if ($statement !== '') $pdo->exec($statement);
}
$pdo->exec("INSERT IGNORE INTO eft_counters (counter_key, next_value) VALUES ('project', 1)");
$rows = $pdo->query('SELECT payload FROM eft_projects')->fetchAll();
$maximum = 0;
foreach ($rows as $row) {
    $payload = json_decode((string)$row['payload'], true);
    $number = (int)preg_replace('/\D+/', '', (string)($payload['meta']['projectNum'] ?? ''));
    $maximum = max($maximum, $number);
}
$statement = $pdo->prepare("UPDATE eft_counters SET next_value = GREATEST(next_value, ?) WHERE counter_key = 'project'");
$statement->execute([$maximum + 1]);
$pdo->exec("INSERT IGNORE INTO eft_counters (counter_key, next_value) VALUES ('application', 1)");
$existingApplications = (int)$pdo->query('SELECT COUNT(*) FROM eft_questionnaires')->fetchColumn();
$rows = $pdo->query("SELECT public_number FROM eft_questionnaires WHERE public_number REGEXP '^EFT-[0-9]{6}$'")->fetchAll();
$maximumApplication = 0;
foreach ($rows as $row) $maximumApplication = max($maximumApplication, (int)substr((string)$row['public_number'], 4));
$statement = $pdo->prepare("UPDATE eft_counters SET next_value = GREATEST(next_value, ?) WHERE counter_key = 'application'");
$statement->execute([max($existingApplications, $maximumApplication) + 1]);
eft_price_seed($pdo);
eft_price_add_bundled_roof_packages($pdo);
$auditProbe = ['ok' => true];
try {
    $pdo->beginTransaction();
    eft_audit(null, 'health_probe', 'system');
    $pdo->rollBack();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('EFT audit probe failed: ' . $error->getMessage());
    $auditProbe = ['ok' => false, 'error' => mb_substr($error->getMessage(), 0, 300)];
}
$projectCreateProbe = ['ok' => true];
$probePhase = 'prices';
try {
    $probePayload = eft_price_project($pdo, ['meta' => ['projectName' => 'Health probe'], 'plan' => ['house' => ['w' => 10, 'h' => 8]]]);
    $probePhase = 'user';
    $probeUserId = (int)$pdo->query('SELECT id FROM eft_users WHERE active = 1 ORDER BY id LIMIT 1')->fetchColumn();
    if (!$probeUserId) throw new RuntimeException('No active employee for project creation probe');
    $pdo->beginTransaction();
    $probePhase = 'number';
    $probePayload['meta']['projectNum'] = eft_next_project_number();
    $probeId = eft_uuid();
    $probeName = eft_project_name($probePayload);
    $probeEncoded = json_encode($probePayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $probePhase = 'project';
    $pdo->prepare('INSERT INTO eft_projects (id, name, payload, owner_id, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$probeId, $probeName, $probeEncoded, $probeUserId, $probeUserId, $probeUserId]);
    $probePhase = 'version';
    $pdo->prepare('INSERT INTO eft_project_versions (project_id, revision, payload, saved_by, reason) VALUES (?, 1, ?, ?, ?)')->execute([$probeId, $probeEncoded, $probeUserId, 'created']);
    $probePhase = 'audit';
    eft_audit($probeUserId, 'project_created', 'project', $probeId);
    $pdo->rollBack();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('EFT project creation probe failed at ' . $probePhase . ': ' . $error->getMessage());
    $projectCreateProbe = ['ok' => false, 'phase' => $probePhase, 'error' => mb_substr($error->getMessage(), 0, 300)];
}
if ($isCli) {
    echo $auditProbe['ok'] && $projectCreateProbe['ok'] ? "EFT database migration complete\n" : "EFT database health probe failed: " . json_encode(['auditProbe' => $auditProbe, 'projectCreateProbe' => $projectCreateProbe]) . "\n";
    if (!$auditProbe['ok'] || !$projectCreateProbe['ok']) exit(1);
}
else {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'message' => 'EFT database migration complete', 'auditProbe' => $auditProbe, 'projectCreateProbe' => $projectCreateProbe]);
}
