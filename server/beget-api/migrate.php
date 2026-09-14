<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
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
echo "EFT database migration complete\n";
