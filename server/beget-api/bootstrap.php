<?php
declare(strict_types=1);

set_exception_handler(function (Throwable $error): void {
    error_log('EFT API unhandled error: ' . $error->getMessage());
    eft_json(['ok' => false, 'code' => 'server_error', 'message' => 'Внутренняя ошибка сервера.'], 500);
});

function eft_json(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function eft_config(): array {
    static $config = null;
    if (is_array($config)) return $config;
    $path = __DIR__ . '/config.local.php';
    if (!is_file($path)) eft_json(['ok' => false, 'code' => 'not_configured', 'message' => 'Сервер общей базы ещё не настроен.'], 503);
    $config = require $path;
    if (!is_array($config)) eft_json(['ok' => false, 'code' => 'bad_config', 'message' => 'Ошибка конфигурации сервера.'], 503);
    return $config;
}

function eft_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $config = eft_config();
    try {
        $pdo = new PDO(
            'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
            $config['db_user'],
            $config['db_password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
        );
    } catch (Throwable $error) {
        error_log('EFT DB connection failed: ' . $error->getMessage());
        eft_json(['ok' => false, 'code' => 'database_unavailable', 'message' => 'Общая база временно недоступна.'], 503);
    }
    return $pdo;
}

function eft_origin_headers(): void {
    $config = eft_config();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $config['allowed_origins'] ?? [], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

function eft_require_allowed_origin(): void {
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '' && !in_array($origin, eft_config()['allowed_origins'] ?? [], true)) {
        eft_json(['ok' => false, 'code' => 'origin_forbidden', 'message' => 'Источник запроса не разрешён.'], 403);
    }
}

function eft_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('EFTSID');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'domain' => '.eftsip.ru', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

function eft_input(int $maxBytes = 8388608): array {
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maxBytes) eft_json(['ok' => false, 'code' => 'payload_too_large', 'message' => 'Слишком большой объём данных.'], 413);
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) eft_json(['ok' => false, 'code' => 'invalid_json', 'message' => 'Некорректный JSON.'], 400);
    return $data;
}

function eft_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function eft_user(): array {
    eft_start_session();
    $user = eft_session_user();
    if (!$user) eft_json(['ok' => false, 'code' => 'authentication_required', 'message' => 'Требуется повторный вход сотрудника.'], 401);
    return $user;
}

function eft_session_tag(array $row): string {
    return hash_hmac('sha256', (string)$row['password_hash'] . '|' . (string)$row['role'] . '|' . (string)$row['active'], (string)eft_config()['app_secret']);
}

function eft_session_user(): ?array {
    if (empty($_SESSION['user']['id']) || empty($_SESSION['auth_tag'])) return null;
    $statement = eft_db()->prepare('SELECT id, username, display_name, password_hash, role, active FROM eft_users WHERE id = ? LIMIT 1');
    $statement->execute([(int)$_SESSION['user']['id']]);
    $row = $statement->fetch();
    if (!$row || !(int)$row['active'] || !hash_equals(eft_session_tag($row), (string)$_SESSION['auth_tag'])) {
        unset($_SESSION['user'], $_SESSION['auth_tag'], $_SESSION['csrf']);
        return null;
    }
    $_SESSION['user'] = ['id' => (int)$row['id'], 'username' => $row['username'], 'displayName' => $row['display_name'], 'role' => $row['role']];
    return $_SESSION['user'];
}

function eft_csrf(): void {
    $expected = $_SESSION['csrf'] ?? '';
    $received = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($expected === '' || !hash_equals($expected, $received)) eft_json(['ok' => false, 'code' => 'csrf_failed', 'message' => 'Сессия изменилась. Повторите действие.'], 419);
}

function eft_require_role(array $roles): array {
    $user = eft_user();
    if (!in_array($user['role'], $roles, true)) eft_json(['ok' => false, 'code' => 'forbidden', 'message' => 'Недостаточно прав.'], 403);
    return $user;
}

function eft_audit(?int $userId, string $action, string $entityType, string $entityId = '', array $details = []): void {
    $statement = eft_db()->prepare('INSERT INTO eft_audit_log (user_id, action_name, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');
    $statement->execute([$userId, $action, $entityType, $entityId, $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null]);
}

function eft_project_name(array $payload): string {
    $number = trim((string)($payload['meta']['projectNum'] ?? ''));
    $customer = trim((string)($payload['meta']['customer'] ?? ''));
    if ($customer !== '' && $number !== '') return mb_substr($customer . ' · № ' . $number, 0, 255);
    if ($customer !== '') return mb_substr($customer, 0, 255);
    if ($number !== '') return mb_substr('Проект № ' . $number, 0, 255);
    return 'Новый проект';
}

function eft_next_counter(string $key): int {
    $pdo = eft_db();
    $ownTransaction = !$pdo->inTransaction();
    if ($ownTransaction) $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT IGNORE INTO eft_counters (counter_key, next_value) VALUES (?, 1)')->execute([$key]);
        $statement = $pdo->prepare('SELECT next_value FROM eft_counters WHERE counter_key = ? FOR UPDATE');
        $statement->execute([$key]);
        $row = $statement->fetch();
        $number = max(1, (int)($row['next_value'] ?? 1));
        $pdo->prepare('UPDATE eft_counters SET next_value = ? WHERE counter_key = ?')->execute([$number + 1, $key]);
        if ($ownTransaction) $pdo->commit();
        return $number;
    } catch (Throwable $error) {
        if ($ownTransaction && $pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function eft_next_project_number(): string {
    return str_pad((string)eft_next_counter('project'), 4, '0', STR_PAD_LEFT);
}

function eft_send_intake_email(array $payload, string $number): bool {
    $config = eft_config();
    $recipient = (string)($config['notification_email'] ?? 'info@eftsip.ru');
    $customer = $payload['format'] === 'eft-client-brief' ? ($payload['customer'] ?? []) : $payload;
    $project = $payload['format'] === 'eft-client-brief' ? ($payload['project'] ?? []) : [];
    $subject = 'Новая заявка EFT ' . $number;
    $lines = [
        'Получена новая заявка ' . $number,
        'Источник: ' . ($payload['format'] === 'eft-client-brief' ? 'анкета будущего дома' : 'форма на сайте'),
        'Клиент: ' . (string)($customer['name'] ?? ''),
        'Телефон: ' . (string)($customer['phone'] ?? ''),
        'Почта: ' . (string)($customer['email'] ?? ''),
        'Проект: ' . (string)($project['buildingType'] ?? ($payload['project'] ?? '')),
        'Комментарий: ' . (string)($payload['notes'] ?? ($payload['comment'] ?? '')),
        '',
        'Откройте раздел «Общие проекты → Анкеты» в калькуляторе.',
    ];
    try {
        eft_send_smtp($recipient, $subject, implode("\n", $lines));
        return true;
    } catch (Throwable $error) {
        error_log('EFT intake SMTP notification failed for ' . $number . ': ' . $error->getMessage());
        return false;
    }
}

function eft_normalize_phone(string $value): ?string {
    $digits = preg_replace('/\D+/', '', $value) ?? '';
    if (strlen($digits) === 11 && ($digits[0] === '7' || $digits[0] === '8')) $digits = substr($digits, 1);
    if (!preg_match('/^[3-9]\d{9}$/', $digits)) return null;
    return '+7 (' . substr($digits, 0, 3) . ') ' . substr($digits, 3, 3) . '-' . substr($digits, 6, 2) . '-' . substr($digits, 8, 2);
}
