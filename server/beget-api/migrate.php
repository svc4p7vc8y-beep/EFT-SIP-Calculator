<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
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
if ($isCli) echo "EFT database migration complete\n";
else {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'message' => 'EFT database migration complete']);
}
