<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

header('Content-Type: text/html; charset=utf-8');
$message = '';
$complete = false;
try {
    $pdo = eft_db();
    $hasUsers = false;
    try { $hasUsers = (int)$pdo->query('SELECT COUNT(*) FROM eft_users')->fetchColumn() > 0; } catch (Throwable) {}
    if ($hasUsers) { http_response_code(404); echo '<!doctype html><meta charset="utf-8"><title>ЭФТ</title><p>Настройка уже завершена.</p>'; exit; }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $config = eft_config();
        $token = (string)($_POST['setup_token'] ?? '');
        $username = mb_strtolower(trim((string)($_POST['username'] ?? '')));
        $displayName = trim((string)($_POST['display_name'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        if (!hash_equals((string)$config['setup_token'], $token)) throw new RuntimeException('Неверный одноразовый код настройки.');
        if (!preg_match('/^[a-z0-9._-]{3,80}$/', $username)) throw new RuntimeException('Логин: 3–80 латинских символов, цифр, точки, дефисы или подчёркивания.');
        if ($displayName === '') throw new RuntimeException('Укажите имя сотрудника.');
        if (strlen($password) < 12) throw new RuntimeException('Пароль должен содержать не менее 12 символов.');
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        foreach (preg_split('/;\s*(?:\r?\n|$)/', (string)$schema) as $statement) if (trim($statement) !== '') $pdo->exec($statement);
        $insert = $pdo->prepare("INSERT INTO eft_users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')");
        $insert->execute([$username, mb_substr($displayName, 0, 160), password_hash($password, PASSWORD_DEFAULT)]);
        $adminId = (int)$pdo->lastInsertId();
        eft_audit($adminId, 'initial_admin_created', 'user', (string)$adminId);
        $complete = true;
    }
} catch (Throwable $error) {
    $message = $error->getMessage();
}
?><!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Настройка общей базы ЭФТ</title><style>body{margin:0;background:#eef3eb;color:#1c2a20;font:16px system-ui}main{max-width:560px;margin:7vh auto;padding:32px;background:#fff;border:1px solid #d6e1d2;border-radius:18px;box-shadow:0 18px 50px #244b3b1c}h1{margin-top:0}label{display:grid;gap:6px;margin:16px 0;font-weight:700}input{padding:12px;border:1px solid #bdcbbb;border-radius:9px;font:inherit}button{width:100%;padding:13px;border:0;border-radius:9px;background:#477d2d;color:#fff;font-weight:800}.error{color:#a5352b}.ok{padding:18px;border-radius:12px;background:#e7f3df;color:#315f20}</style></head><body><main><?php if ($complete): ?><div class="ok"><h1>Общая база ЭФТ настроена</h1><p>Первый администратор создан. Закройте эту страницу и войдите в калькулятор.</p></div><?php else: ?><h1>Первичная настройка ЭФТ</h1><p>Создайте первого администратора. После успешной настройки эта форма автоматически закроется.</p><?php if ($message): ?><p class="error"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?><form method="post" autocomplete="off"><label>Одноразовый код настройки<input name="setup_token" type="password" required></label><label>Логин администратора<input name="username" pattern="[a-z0-9._-]{3,80}" required></label><label>Имя сотрудника<input name="display_name" required maxlength="160"></label><label>Пароль администратора<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><button type="submit">Создать администратора и таблицы</button></form><?php endif; ?></main></body></html>
