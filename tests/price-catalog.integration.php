<?php
declare(strict_types=1);
// Runs only against an isolated CI database, never against Beget credentials.
final class ApiResponse extends RuntimeException { public array $body; public int $status; public function __construct(array $body, int $status) { parent::__construct($body['code'] ?? 'response'); $this->body = $body; $this->status = $status; } }
function eft_json(array $body, int $status = 200): void { throw new ApiResponse($body, $status); }
function check(bool $value, string $label): void { if (!$value) throw new RuntimeException($label); }
function reject(callable $call, string $code): void { try { $call(); } catch (ApiResponse $error) { check(($error->body['code'] ?? '') === $code, 'Expected ' . $code . ', got ' . $error->getMessage()); return; } throw new RuntimeException('Expected rejection ' . $code); }
require __DIR__ . '/../server/beget-api/price-catalog.php';
$dsn = (string)getenv('EFT_PRICE_TEST_DSN');
if (!str_contains($dsn, 'dbname=eft_price_test')) throw new RuntimeException('An isolated eft_price_test database is required');
$pdo = new PDO($dsn, (string)getenv('EFT_PRICE_TEST_USER'), (string)getenv('EFT_PRICE_TEST_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
foreach (preg_split('/;\s*(?:\r?\n|$)/', file_get_contents(__DIR__ . '/../server/beget-api/schema.sql')) as $sql) if (trim($sql)) $pdo->exec($sql);
$pdo->exec("INSERT INTO eft_users (username, display_name, password_hash, role) VALUES ('price-admin', 'Администратор', 'test', 'admin'), ('price-manager', 'Сотрудник', 'test', 'manager')");
$admin = ['id' => 1, 'role' => 'admin']; $manager = ['id' => 2, 'role' => 'manager']; $_SESSION = [];
check(eft_price_can_edit($admin), 'Admin access'); check(!eft_price_can_edit($manager), 'Manager starts locked'); check(!eft_price_can_edit(['role' => 'viewer']), 'Viewer read-only');
reject(fn() => eft_price_require_edit($manager), 'price_editor_locked');
$_SESSION['price_editor_unlocked'] = true; check(eft_price_can_edit($manager), 'Server unlock');
$_SESSION = ['price_editor_locked' => true]; check(!eft_price_can_edit($admin), 'Admin explicit lock'); $_SESSION = [];
$base = eft_price_read($pdo); check($base['revision'] === 1, 'Seed revision');
$a = $base['payload']['priceMat'][0]; $b = $base['payload']['priceMat'][1];
$patch = fn(array $old, float $price): array => ['key' => 'priceMat', 'id' => $old['id'], 'before' => $old, 'after' => array_merge($old, ['price' => $price])];
$result = eft_price_update($pdo, $admin, ['revision' => 1, 'changes' => [$patch($a, 1700)]]);
check($result['revision'] === 2, 'Price revision increment');
// A concurrent edit of another row is allowed even when its revision is older.
$result = eft_price_update($pdo, $manager, ['revision' => 1, 'changes' => [$patch($b, 4100)]]);
check($result['revision'] === 3, 'Disjoint concurrent edit');
reject(fn() => eft_price_update($pdo, $manager, ['changes' => [$patch($a, 1800)]]), 'price_conflict');
check(eft_price_read($pdo)['revision'] === 3, 'Conflict preserves revision');
check((int)$pdo->query('SELECT COUNT(*) FROM eft_price_history')->fetchColumn() === 2, 'Only successful edits have history');
$oldC = $base['payload']['priceMat'][2];
reject(fn() => eft_price_update($pdo, $admin, ['changes' => [$patch($oldC, 500), $patch($a, 2000)]]), 'price_conflict');
check(eft_price_read($pdo)['payload']['priceMat'][2]['price'] == $oldC['price'], 'Atomic rollback of earlier bulk row');
reject(fn() => eft_price_update($pdo, $admin, ['changes' => [$patch($oldC, -1)]]), 'invalid_price');
$wrongUnit = $patch($oldC, 2000); $wrongUnit['after']['unit'] = 'км';
reject(fn() => eft_price_update($pdo, $admin, ['changes' => [$wrongUnit]]), 'unit_change_forbidden');
$wrongName = $patch($oldC, 2000); $wrongName['after']['name'] = 'Другая позиция';
reject(fn() => eft_price_update($pdo, $admin, ['changes' => [$wrongName]]), 'catalog_identity_change_forbidden');
$history = $pdo->query('SELECT * FROM eft_price_history ORDER BY id')->fetchAll();
check(json_decode($history[0]['before_row'], true)['price'] == $a['price'], 'History previous price');
check(json_decode($history[0]['after_row'], true)['price'] === 1700, 'History saved price');
check((int)$history[1]['changed_by'] === 2, 'History author');
$snapshot = eft_price_project($pdo, ['priceMat' => [['id' => $a['id'], 'price' => 1]], 'meta' => ['projectNum' => '5']]);
check($snapshot['priceMat'][0]['price'] === 1700, 'Old project receives current price');
check($snapshot['sharedPriceCatalog']['revision'] === 3, 'Snapshot revision');
eft_price_seed($pdo); check(eft_price_read($pdo)['revision'] === 3, 'Redeploy preserves edited catalog');
echo "Price catalog integration passed: access, history, atomic edits, concurrent conflicts, current project prices.\n";
