<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

eft_origin_headers();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
eft_start_session();

$action = (string)($_GET['action'] ?? 'session');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
$pdo = eft_db();

if ($action === 'session' && $method === 'GET') {
    $user = $_SESSION['user'] ?? null;
    eft_json(['ok' => true, 'user' => $user, 'csrf' => $user ? ($_SESSION['csrf'] ?? '') : '']);
}

if ($action === 'login' && $method === 'POST') {
    $input = eft_input(65536);
    $username = mb_strtolower(trim((string)($input['username'] ?? '')));
    $password = (string)($input['password'] ?? '');
    usleep(250000);
    $statement = $pdo->prepare('SELECT id, username, display_name, password_hash, role, active FROM eft_users WHERE username = ? LIMIT 1');
    $statement->execute([$username]);
    $row = $statement->fetch();
    if (!$row || !$row['active'] || !password_verify($password, $row['password_hash'])) {
        eft_json(['ok' => false, 'code' => 'invalid_credentials', 'message' => 'Неверное имя пользователя или пароль.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    $_SESSION['user'] = ['id' => (int)$row['id'], 'username' => $row['username'], 'displayName' => $row['display_name'], 'role' => $row['role']];
    $pdo->prepare('UPDATE eft_users SET last_login_at = NOW() WHERE id = ?')->execute([(int)$row['id']]);
    eft_audit((int)$row['id'], 'login', 'session');
    eft_json(['ok' => true, 'user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}

if ($action === 'intake' && $method === 'POST') {
    eft_require_allowed_origin();
    $input = eft_input(2097152);
    if (!empty($input['website'])) eft_json(['ok' => true, 'number' => 'EFT-' . date('ymd')]);
    $format = (string)($input['format'] ?? '');
    if (!in_array($format, ['eft-client-brief', 'eft-site-inquiry'], true)) eft_json(['ok' => false, 'code' => 'invalid_intake', 'message' => 'Формат анкеты не поддерживается.'], 422);
    $config = eft_config();
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipHash = hash_hmac('sha256', $ip, (string)$config['app_secret']);
    $rate = $pdo->prepare('SELECT COUNT(*) FROM eft_questionnaires WHERE source_ip_hash = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
    $rate->execute([$ipHash]);
    if ((int)$rate->fetchColumn() >= 8) eft_json(['ok' => false, 'code' => 'rate_limited', 'message' => 'Слишком много отправок. Попробуйте позже.'], 429);
    $customer = $format === 'eft-client-brief' ? ($input['customer'] ?? []) : $input;
    $name = mb_substr(trim((string)($customer['name'] ?? '')), 0, 180);
    $phone = mb_substr(trim((string)($customer['phone'] ?? '')), 0, 80);
    $email = mb_substr(trim((string)($customer['email'] ?? '')), 0, 190);
    if ($name === '' || ($phone === '' && $email === '')) eft_json(['ok' => false, 'code' => 'missing_contact', 'message' => 'Укажите имя и телефон или почту.'], 422);
    if ($format === 'eft-client-brief' && empty($customer['consent'])) eft_json(['ok' => false, 'code' => 'consent_required', 'message' => 'Необходимо согласие на обработку данных.'], 422);
    $id = eft_uuid();
    $number = 'EFT-' . date('ymd') . '-' . strtoupper(substr(str_replace('-', '', $id), 0, 6));
    $statement = $pdo->prepare('INSERT INTO eft_questionnaires (id, public_number, customer_name, phone, email, payload, source_ip_hash, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $statement->execute([$id, $number, $name, $phone, $email, json_encode($input, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ipHash, !empty($customer['consent']) ? date('Y-m-d H:i:s') : null]);
    eft_audit(null, 'intake_created', 'questionnaire', $id, ['number' => $number]);
    eft_json(['ok' => true, 'id' => $id, 'number' => $number], 201);
}

$user = eft_user();
if (!in_array($method, ['GET'], true)) eft_csrf();
if (!in_array($method, ['GET'], true) && $user['role'] === 'viewer') {
    eft_json(['ok' => false, 'code' => 'forbidden', 'message' => 'Роль «Просмотр» не может изменять данные.'], 403);
}

if ($action === 'logout' && $method === 'POST') {
    eft_audit((int)$user['id'], 'logout', 'session');
    $_SESSION = [];
    session_destroy();
    eft_json(['ok' => true]);
}

if ($action === 'projects' && $method === 'GET') {
    $rows = $pdo->query('SELECT p.id, p.name, p.status, p.revision, p.created_at, p.updated_at, u.display_name AS updated_by FROM eft_projects p JOIN eft_users u ON u.id = p.updated_by ORDER BY p.updated_at DESC LIMIT 250')->fetchAll();
    eft_json(['ok' => true, 'projects' => $rows]);
}

if ($action === 'project' && $method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    $statement = $pdo->prepare('SELECT id, name, status, revision, payload, created_at, updated_at FROM eft_projects WHERE id = ? LIMIT 1');
    $statement->execute([$id]);
    $row = $statement->fetch();
    if (!$row) eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Проект не найден.'], 404);
    $row['payload'] = json_decode($row['payload'], true);
    eft_json(['ok' => true, 'project' => $row]);
}

if ($action === 'projects' && $method === 'POST') {
    $input = eft_input();
    $payload = is_array($input['payload'] ?? null) ? $input['payload'] : [];
    if (!$payload) eft_json(['ok' => false, 'code' => 'missing_project', 'message' => 'Нет данных проекта.'], 422);
    $id = eft_uuid();
    $name = mb_substr(trim((string)($input['name'] ?? eft_project_name($payload))), 0, 255) ?: 'Новый проект';
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO eft_projects (id, name, payload, owner_id, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, $name, $encoded, (int)$user['id'], (int)$user['id'], (int)$user['id']]);
    $pdo->prepare('INSERT INTO eft_project_versions (project_id, revision, payload, saved_by, reason) VALUES (?, 1, ?, ?, ?)')->execute([$id, $encoded, (int)$user['id'], 'created']);
    $pdo->commit();
    eft_audit((int)$user['id'], 'project_created', 'project', $id);
    eft_json(['ok' => true, 'project' => ['id' => $id, 'name' => $name, 'status' => 'new', 'revision' => 1, 'payload' => $payload]], 201);
}

if ($action === 'project' && $method === 'PUT') {
    $input = eft_input();
    $id = (string)($input['id'] ?? '');
    $revision = (int)($input['revision'] ?? 0);
    $payload = is_array($input['payload'] ?? null) ? $input['payload'] : [];
    $statement = $pdo->prepare('SELECT revision, payload, updated_at FROM eft_projects WHERE id = ? FOR UPDATE');
    $pdo->beginTransaction();
    $statement->execute([$id]);
    $current = $statement->fetch();
    if (!$current) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Проект не найден.'], 404); }
    if ((int)$current['revision'] !== $revision) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'revision_conflict', 'message' => 'Проект уже изменён другим сотрудником.', 'currentRevision' => (int)$current['revision'], 'updatedAt' => $current['updated_at']], 409); }
    $nextRevision = $revision + 1;
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $name = eft_project_name($payload);
    $reason = !empty($input['checkpoint']) ? 'checkpoint' : 'autosave';
    $pdo->prepare('UPDATE eft_projects SET name = ?, revision = ?, payload = ?, updated_by = ?, updated_at = NOW() WHERE id = ?')->execute([$name, $nextRevision, $encoded, (int)$user['id'], $id]);
    $lastVersion = $pdo->prepare('SELECT created_at FROM eft_project_versions WHERE project_id = ? ORDER BY revision DESC LIMIT 1');
    $lastVersion->execute([$id]);
    $lastAt = $lastVersion->fetchColumn();
    $needsVersion = !empty($input['checkpoint']) || !$lastAt || strtotime((string)$lastAt) < time() - 300;
    if ($needsVersion) $pdo->prepare('INSERT INTO eft_project_versions (project_id, revision, payload, saved_by, reason) VALUES (?, ?, ?, ?, ?)')->execute([$id, $nextRevision, $encoded, (int)$user['id'], $reason]);
    $pdo->commit();
    eft_audit((int)$user['id'], 'project_saved', 'project', $id, ['revision' => $nextRevision, 'checkpoint' => !empty($input['checkpoint'])]);
    eft_json(['ok' => true, 'revision' => $nextRevision, 'name' => $name, 'versionCreated' => $needsVersion]);
}

if ($action === 'versions' && $method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    $statement = $pdo->prepare('SELECT v.id, v.revision, v.reason, v.created_at, u.display_name AS saved_by FROM eft_project_versions v JOIN eft_users u ON u.id = v.saved_by WHERE v.project_id = ? ORDER BY v.revision DESC LIMIT 100');
    $statement->execute([$id]);
    eft_json(['ok' => true, 'versions' => $statement->fetchAll()]);
}

if ($action === 'version' && $method === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    $statement = $pdo->prepare('SELECT project_id, revision, payload, created_at FROM eft_project_versions WHERE id = ? LIMIT 1');
    $statement->execute([$id]);
    $row = $statement->fetch();
    if (!$row) eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Версия не найдена.'], 404);
    $row['payload'] = json_decode($row['payload'], true);
    eft_json(['ok' => true, 'version' => $row]);
}

if ($action === 'intakes' && $method === 'GET') {
    $rows = $pdo->query("SELECT id, public_number, status, customer_name, phone, email, payload, created_at, updated_at FROM eft_questionnaires WHERE status <> 'archived' ORDER BY created_at DESC LIMIT 250")->fetchAll();
    foreach ($rows as &$row) $row['payload'] = json_decode($row['payload'], true);
    eft_json(['ok' => true, 'intakes' => $rows]);
}

if ($action === 'intake-status' && $method === 'POST') {
    $input = eft_input(65536);
    $id = (string)($input['id'] ?? '');
    $status = (string)($input['status'] ?? 'reviewed');
    if (!in_array($status, ['reviewed', 'imported', 'archived'], true)) eft_json(['ok' => false, 'code' => 'invalid_status', 'message' => 'Некорректный статус.'], 422);
    $projectId = $input['projectId'] ?? null;
    $pdo->prepare('UPDATE eft_questionnaires SET status = ?, imported_project_id = ?, updated_at = NOW() WHERE id = ?')->execute([$status, $projectId, $id]);
    eft_audit((int)$user['id'], 'intake_status_changed', 'questionnaire', $id, ['status' => $status, 'projectId' => $projectId]);
    eft_json(['ok' => true]);
}

if ($action === 'shared' && $method === 'GET') {
    $key = (string)($_GET['key'] ?? '');
    if (!in_array($key, ['plan-library', 'knowledge-library'], true)) eft_json(['ok' => false, 'code' => 'invalid_key', 'message' => 'Неизвестная библиотека.'], 422);
    $statement = $pdo->prepare('SELECT revision, payload, updated_at FROM eft_shared_documents WHERE document_key = ? LIMIT 1');
    $statement->execute([$key]);
    $row = $statement->fetch();
    eft_json(['ok' => true, 'revision' => (int)($row['revision'] ?? 0), 'payload' => $row ? json_decode($row['payload'], true) : [], 'updatedAt' => $row['updated_at'] ?? null]);
}

if ($action === 'shared' && $method === 'PUT') {
    $input = eft_input();
    $key = (string)($input['key'] ?? '');
    if (!in_array($key, ['plan-library', 'knowledge-library'], true)) eft_json(['ok' => false, 'code' => 'invalid_key', 'message' => 'Неизвестная библиотека.'], 422);
    $payload = is_array($input['payload'] ?? null) ? $input['payload'] : [];
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $statement = $pdo->prepare('INSERT INTO eft_shared_documents (document_key, revision, payload, updated_by) VALUES (?, 1, ?, ?) ON DUPLICATE KEY UPDATE revision = revision + 1, payload = VALUES(payload), updated_by = VALUES(updated_by), updated_at = NOW()');
    $statement->execute([$key, $encoded, (int)$user['id']]);
    eft_audit((int)$user['id'], 'shared_library_saved', 'shared_document', $key, ['count' => count($payload)]);
    eft_json(['ok' => true]);
}

if ($action === 'users' && $method === 'GET') {
    eft_require_role(['admin']);
    $rows = $pdo->query('SELECT id, username, display_name, role, active, created_at, last_login_at FROM eft_users ORDER BY display_name')->fetchAll();
    eft_json(['ok' => true, 'users' => $rows]);
}

if ($action === 'users' && $method === 'POST') {
    $admin = eft_require_role(['admin']);
    $input = eft_input(65536);
    $username = mb_strtolower(trim((string)($input['username'] ?? '')));
    $displayName = mb_substr(trim((string)($input['displayName'] ?? '')), 0, 160);
    $password = (string)($input['password'] ?? '');
    $role = (string)($input['role'] ?? 'manager');
    if (!preg_match('/^[a-z0-9._-]{3,80}$/', $username) || $displayName === '' || strlen($password) < 12 || !in_array($role, ['admin', 'manager', 'estimator', 'viewer'], true)) eft_json(['ok' => false, 'code' => 'invalid_user', 'message' => 'Проверьте имя, роль и пароль не короче 12 символов.'], 422);
    try {
        $pdo->prepare('INSERT INTO eft_users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')->execute([$username, $displayName, password_hash($password, PASSWORD_DEFAULT), $role]);
    } catch (PDOException $error) {
        if ((string)$error->getCode() === '23000') eft_json(['ok' => false, 'code' => 'duplicate_user', 'message' => 'Такое имя пользователя уже существует.'], 409);
        throw $error;
    }
    eft_audit((int)$admin['id'], 'user_created', 'user', (string)$pdo->lastInsertId(), ['username' => $username, 'role' => $role]);
    eft_json(['ok' => true], 201);
}

eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Метод API не найден.'], 404);
