<?php
declare(strict_types=1);

require __DIR__ . '/../server/beget-api/site-visits.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$pdo = new PDO(
    (string)getenv('EFT_PRICE_TEST_DSN'),
    (string)getenv('EFT_PRICE_TEST_USER'),
    (string)getenv('EFT_PRICE_TEST_PASSWORD'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
foreach (preg_split('/;\s*(?:\r?\n|$)/', (string)file_get_contents(__DIR__ . '/../server/beget-api/schema.sql')) as $sql) {
    if (trim($sql) !== '') $pdo->exec($sql);
}
$pdo->exec('DELETE FROM eft_site_daily_stats');

$first = [];
$second = [];
check(eft_record_site_visit($pdo, $first, '2026-10-13', 1000), 'First visit must count');
check(!eft_record_site_visit($pdo, $first, '2026-10-13', 1100), 'Refresh within 30 minutes must not count');
check(eft_record_site_visit($pdo, $first, '2026-10-13', 3000), 'Returning visit after 30 minutes must count');
check(eft_record_site_visit($pdo, $second, '2026-10-13', 3000), 'Another session must count');
check(eft_record_site_visit($pdo, $first, '2026-10-14', 3200), 'A new day must count');

$stats = eft_site_stats($pdo, '2026-10-14');
check($stats['allTimeVisits'] === 4, 'All-time visits mismatch');
check($stats['today']['visits'] === 1 && $stats['today']['visitors'] === 1, 'Today totals mismatch');
check($stats['last7']['visits'] === 4 && $stats['last7']['visitors'] === 3, 'Seven-day totals mismatch');
check($stats['last30']['visits'] === 4 && $stats['last30']['visitors'] === 3, 'Thirty-day totals mismatch');
check(count($stats['days']) === 30, 'Missing zero-filled days');
check($stats['days'][28]['visits'] === 3 && $stats['days'][28]['visitors'] === 2, 'Prior day totals mismatch');
echo "Site visit statistics integration passed\n";
