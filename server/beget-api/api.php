<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail-client.php';

eft_origin_headers();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
eft_start_session();

$action = (string)($_GET['action'] ?? 'session');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
$pdo = eft_db();

function eft_collect_uploaded_files(string $field, int $maxFiles = 10, int $maxFileBytes = 8388608, int $maxTotalBytes = 20971520): array {
    if (!isset($_FILES[$field])) return [];
    $upload = $_FILES[$field];
    $names = is_array($upload['name'] ?? null) ? $upload['name'] : [$upload['name'] ?? ''];
    $types = is_array($upload['type'] ?? null) ? $upload['type'] : [$upload['type'] ?? ''];
    $paths = is_array($upload['tmp_name'] ?? null) ? $upload['tmp_name'] : [$upload['tmp_name'] ?? ''];
    $errors = is_array($upload['error'] ?? null) ? $upload['error'] : [$upload['error'] ?? UPLOAD_ERR_NO_FILE];
    $sizes = is_array($upload['size'] ?? null) ? $upload['size'] : [$upload['size'] ?? 0];
    if (count($names) > $maxFiles) eft_json(['ok' => false, 'code' => 'too_many_files', 'message' => "Можно приложить не более {$maxFiles} файлов."], 422);
    $allowedExtensions = ['pdf','jpg','jpeg','png','webp','gif','doc','docx','xls','xlsx','csv','txt','ppt','pptx','zip','rar','7z','dwg','dxf','json'];
    $files = [];
    $total = 0;
    foreach ($names as $index => $rawName) {
        $error = (int)($errors[$index] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) continue;
        if ($error !== UPLOAD_ERR_OK) eft_json(['ok' => false, 'code' => 'upload_failed', 'message' => 'Не удалось загрузить один из файлов.'], 422);
        $name = mb_substr(basename((string)$rawName), 0, 255);
        $extension = mb_strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $size = (int)($sizes[$index] ?? 0);
        if ($name === '' || !in_array($extension, $allowedExtensions, true)) eft_json(['ok' => false, 'code' => 'invalid_file_type', 'message' => 'Этот тип файла не поддерживается. Используйте документы, изображения, архивы, DWG или DXF.'], 422);
        if ($size < 1 || $size > $maxFileBytes) eft_json(['ok' => false, 'code' => 'file_too_large', 'message' => 'Размер одного файла не должен превышать 8 МБ.'], 413);
        $total += $size;
        if ($total > $maxTotalBytes) eft_json(['ok' => false, 'code' => 'files_too_large', 'message' => 'Общий размер одной загрузки не должен превышать 20 МБ.'], 413);
        $path = (string)($paths[$index] ?? '');
        if (!is_uploaded_file($path)) eft_json(['ok' => false, 'code' => 'invalid_upload', 'message' => 'Сервер не подтвердил загрузку файла.'], 422);
        $content = file_get_contents($path);
        if ($content === false) eft_json(['ok' => false, 'code' => 'upload_read_failed', 'message' => 'Не удалось прочитать загруженный файл.'], 500);
        $detected = function_exists('finfo_open') ? (new finfo(FILEINFO_MIME_TYPE))->file($path) : '';
        $files[] = ['name' => $name, 'type' => $detected ?: ((string)($types[$index] ?? '') ?: 'application/octet-stream'), 'size' => $size, 'content' => $content];
    }
    return $files;
}

if ($action === 'session' && $method === 'GET') {
    $user = eft_session_user();
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
    $_SESSION['auth_tag'] = eft_session_tag($row);
    $pdo->prepare('UPDATE eft_users SET last_login_at = NOW() WHERE id = ?')->execute([(int)$row['id']]);
    eft_audit((int)$row['id'], 'login', 'session');
    eft_json(['ok' => true, 'user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}

if ($action === 'intake' && $method === 'POST') {
    eft_require_allowed_origin();
    $input = eft_input(16777216);
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
    $phone = eft_normalize_phone(mb_substr(trim((string)($customer['phone'] ?? '')), 0, 80));
    $email = mb_substr(trim((string)($customer['email'] ?? '')), 0, 190);
    if ($name === '' || $phone === null) eft_json(['ok' => false, 'code' => 'invalid_phone', 'message' => 'Укажите имя и полный российский номер телефона в формате +7 (___) ___-__-__.'], 422);
    if ($format === 'eft-client-brief' && empty($customer['consent'])) eft_json(['ok' => false, 'code' => 'consent_required', 'message' => 'Необходимо согласие на обработку данных.'], 422);
    if ($format === 'eft-client-brief') $input['customer']['phone'] = $phone;
    else $input['phone'] = $phone;
    $id = eft_uuid();
    $attachmentFiles = is_array($input['attachmentFiles'] ?? null) ? $input['attachmentFiles'] : [];
    unset($input['attachmentFiles']);
    if (count($attachmentFiles) > 8) eft_json(['ok' => false, 'code' => 'too_many_attachments', 'message' => 'Можно приложить не более 8 файлов.'], 422);
    $decodedAttachments = [];
    $totalBytes = 0;
    foreach ($attachmentFiles as $file) {
        $mime = (string)($file['type'] ?? '');
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true)) eft_json(['ok' => false, 'code' => 'invalid_attachment', 'message' => 'Допустимы PDF, JPG, PNG и WEBP.'], 422);
        $content = base64_decode((string)($file['data'] ?? ''), true);
        if ($content === false || strlen($content) > 4194304) eft_json(['ok' => false, 'code' => 'attachment_too_large', 'message' => 'Каждый файл должен быть не больше 4 МБ.'], 413);
        $totalBytes += strlen($content);
        if ($totalBytes > 10485760) eft_json(['ok' => false, 'code' => 'attachments_too_large', 'message' => 'Общий размер файлов должен быть не больше 10 МБ.'], 413);
        $decodedAttachments[] = ['id' => eft_uuid(), 'name' => mb_substr(basename((string)($file['name'] ?? 'file')), 0, 255), 'type' => $mime, 'content' => $content];
    }
    $pdo->beginTransaction();
    $number = 'EFT-' . str_pad((string)eft_next_counter('application'), 6, '0', STR_PAD_LEFT);
    $statement = $pdo->prepare('INSERT INTO eft_questionnaires (id, public_number, customer_name, phone, email, payload, source_ip_hash, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $statement->execute([$id, $number, $name, $phone, $email, json_encode($input, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ipHash, !empty($customer['consent']) ? date('Y-m-d H:i:s') : null]);
    $attachmentStatement = $pdo->prepare('INSERT INTO eft_questionnaire_attachments (id, questionnaire_id, original_name, mime_type, size_bytes, content) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($decodedAttachments as $file) $attachmentStatement->execute([$file['id'], $id, $file['name'], $file['type'], strlen($file['content']), $file['content']]);
    $pdo->commit();
    eft_audit(null, 'intake_created', 'questionnaire', $id, ['number' => $number]);
    $mailSent = eft_send_intake_email($input, $number);
    eft_json(['ok' => true, 'id' => $id, 'number' => $number, 'mailAccepted' => $mailSent], 201);
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

if ($action === 'files' && $method === 'GET') {
    $folderId = trim((string)($_GET['folder'] ?? ''));
    if ($folderId === 'questionnaires') {
        $rows = $pdo->query("SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.created_at, q.public_number, q.customer_name FROM eft_questionnaire_attachments a JOIN eft_questionnaires q ON q.id = a.questionnaire_id ORDER BY a.created_at DESC LIMIT 500")->fetchAll();
        foreach ($rows as &$row) { $row['source'] = 'questionnaire'; $row['downloadAction'] = 'attachment'; }
        eft_json(['ok' => true, 'folder' => ['id' => 'questionnaires', 'name' => 'Файлы из анкет', 'virtual' => true], 'breadcrumbs' => [['id' => '', 'name' => 'Файлы'], ['id' => 'questionnaires', 'name' => 'Файлы из анкет']], 'folders' => [], 'files' => $rows]);
    }
    $folder = null;
    if ($folderId !== '') {
        if (!preg_match('/^[a-f0-9-]{36}$/i', $folderId)) eft_json(['ok' => false, 'code' => 'invalid_folder', 'message' => 'Папка не найдена.'], 404);
        $statement = $pdo->prepare('SELECT id, parent_id, name FROM eft_file_folders WHERE id = ? LIMIT 1');
        $statement->execute([$folderId]);
        $folder = $statement->fetch();
        if (!$folder) eft_json(['ok' => false, 'code' => 'folder_not_found', 'message' => 'Папка не найдена.'], 404);
    }
    $folderStatement = $pdo->prepare($folderId === '' ? 'SELECT f.id, f.parent_id, f.name, f.created_at, u.display_name AS created_by FROM eft_file_folders f JOIN eft_users u ON u.id = f.created_by WHERE f.parent_id IS NULL ORDER BY f.name' : 'SELECT f.id, f.parent_id, f.name, f.created_at, u.display_name AS created_by FROM eft_file_folders f JOIN eft_users u ON u.id = f.created_by WHERE f.parent_id = ? ORDER BY f.name');
    $folderStatement->execute($folderId === '' ? [] : [$folderId]);
    $fileStatement = $pdo->prepare($folderId === '' ? 'SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at, u.display_name AS created_by FROM eft_files f JOIN eft_users u ON u.id = f.created_by WHERE f.folder_id IS NULL ORDER BY f.created_at DESC' : 'SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at, u.display_name AS created_by FROM eft_files f JOIN eft_users u ON u.id = f.created_by WHERE f.folder_id = ? ORDER BY f.created_at DESC');
    $fileStatement->execute($folderId === '' ? [] : [$folderId]);
    $files = $fileStatement->fetchAll();
    foreach ($files as &$file) { $file['source'] = 'shared'; $file['downloadAction'] = 'file-download'; }
    $parents = [];
    $cursor = $folder;
    while ($cursor && count($parents) < 30) {
        array_unshift($parents, ['id' => $cursor['id'], 'name' => $cursor['name']]);
        if (!$cursor['parent_id']) break;
        $parentStatement = $pdo->prepare('SELECT id, parent_id, name FROM eft_file_folders WHERE id = ? LIMIT 1');
        $parentStatement->execute([$cursor['parent_id']]);
        $cursor = $parentStatement->fetch();
    }
    $questionnaireCount = (int)$pdo->query('SELECT COUNT(*) FROM eft_questionnaire_attachments')->fetchColumn();
    eft_json(['ok' => true, 'folder' => $folder, 'breadcrumbs' => array_merge([['id' => '', 'name' => 'Файлы']], $parents), 'folders' => $folderStatement->fetchAll(), 'files' => $files, 'questionnaireCount' => $questionnaireCount]);
}

if ($action === 'file-folder' && $method === 'POST') {
    $input = eft_input(32768);
    $name = trim(mb_substr((string)($input['name'] ?? ''), 0, 180));
    $parentId = trim((string)($input['parentId'] ?? '')) ?: null;
    if ($name === '' || preg_match('/[\\\\\/<>:"|?*]/u', $name)) eft_json(['ok' => false, 'code' => 'invalid_folder_name', 'message' => 'Введите название папки без служебных символов.'], 422);
    if ($parentId) {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM eft_file_folders WHERE id = ?');
        $statement->execute([$parentId]);
        if (!(int)$statement->fetchColumn()) eft_json(['ok' => false, 'code' => 'folder_not_found', 'message' => 'Родительская папка не найдена.'], 404);
    }
    $duplicate = $pdo->prepare($parentId ? 'SELECT COUNT(*) FROM eft_file_folders WHERE parent_id = ? AND name = ?' : 'SELECT COUNT(*) FROM eft_file_folders WHERE parent_id IS NULL AND name = ?');
    $duplicate->execute($parentId ? [$parentId, $name] : [$name]);
    if ((int)$duplicate->fetchColumn()) eft_json(['ok' => false, 'code' => 'folder_exists', 'message' => 'Папка с таким названием уже существует.'], 409);
    $id = eft_uuid();
    $pdo->prepare('INSERT INTO eft_file_folders (id, parent_id, name, created_by) VALUES (?, ?, ?, ?)')->execute([$id, $parentId, $name, (int)$user['id']]);
    eft_audit((int)$user['id'], 'file_folder_created', 'file_folder', $id, ['name' => $name]);
    eft_json(['ok' => true, 'folder' => ['id' => $id, 'parent_id' => $parentId, 'name' => $name]], 201);
}

if ($action === 'file-upload' && $method === 'POST') {
    $folderId = trim((string)($_POST['folderId'] ?? '')) ?: null;
    if ($folderId) {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM eft_file_folders WHERE id = ?');
        $statement->execute([$folderId]);
        if (!(int)$statement->fetchColumn()) eft_json(['ok' => false, 'code' => 'folder_not_found', 'message' => 'Папка не найдена.'], 404);
    }
    $uploads = eft_collect_uploaded_files('files');
    if (!$uploads) eft_json(['ok' => false, 'code' => 'missing_files', 'message' => 'Выберите хотя бы один файл.'], 422);
    $statement = $pdo->prepare('INSERT INTO eft_files (id, folder_id, original_name, mime_type, size_bytes, content, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $ids = [];
    $pdo->beginTransaction();
    foreach ($uploads as $file) {
        $id = eft_uuid();
        $statement->execute([$id, $folderId, $file['name'], $file['type'], $file['size'], $file['content'], (int)$user['id']]);
        $ids[] = $id;
    }
    $pdo->commit();
    eft_audit((int)$user['id'], 'files_uploaded', 'file_folder', $folderId ?? '', ['count' => count($ids)]);
    eft_json(['ok' => true, 'ids' => $ids, 'count' => count($ids)], 201);
}

if ($action === 'file-download' && $method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    $statement = $pdo->prepare('SELECT original_name, mime_type, size_bytes, content FROM eft_files WHERE id = ? LIMIT 1');
    $statement->execute([$id]);
    $file = $statement->fetch();
    if (!$file) eft_json(['ok' => false, 'code' => 'file_not_found', 'message' => 'Файл не найден.'], 404);
    header('Content-Type: ' . $file['mime_type']);
    header('Content-Length: ' . (int)$file['size_bytes']);
    header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($file['original_name']));
    header('Cache-Control: private, no-store');
    echo $file['content'];
    exit;
}

if ($action === 'projects' && $method === 'GET') {
    $rows = $pdo->query("SELECT p.id, p.name, p.status, p.revision, p.payload, p.created_at, p.updated_at, u.display_name AS updated_by FROM eft_projects p JOIN eft_users u ON u.id = p.updated_by WHERE p.status <> 'archived' ORDER BY p.updated_at DESC LIMIT 250")->fetchAll();
    foreach ($rows as &$row) {
        $payload = json_decode((string)$row['payload'], true) ?: [];
        $row['summary'] = ['number' => $payload['meta']['projectNum'] ?? '', 'customer' => $payload['meta']['customer'] ?? '', 'buildingType' => $payload['meta']['buildingType'] ?? '', 'address' => $payload['meta']['address'] ?? '', 'floors' => $payload['meta']['floors'] ?? '', 'area' => $payload['meta']['area'] ?? ''];
        unset($row['payload']);
    }
    eft_json(['ok' => true, 'projects' => $rows]);
}

if ($action === 'mail-status' && $method === 'GET') {
    $state = eft_mail_ready();
    $state['unread'] = $state['configured'] && $state['imapAvailable'] ? eft_mail_unread_count() : 0;
    eft_json(['ok' => true, 'mail' => $state]);
}

if ($action === 'mail-messages' && $method === 'GET') {
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $query = mb_substr(trim((string)($_GET['query'] ?? '')), 0, 120);
    eft_json(array_merge(['ok' => true], eft_mail_overview($limit, $offset, $query)));
}

if ($action === 'mail-message' && $method === 'GET') {
    $uid = (int)($_GET['uid'] ?? 0);
    if ($uid < 1) eft_json(['ok' => false, 'code' => 'invalid_uid', 'message' => 'Письмо не найдено.'], 422);
    eft_json(['ok' => true, 'message' => eft_mail_message($uid, true)]);
}

if ($action === 'mail-attachment' && $method === 'GET') {
    $file = eft_mail_attachment((int)($_GET['uid'] ?? 0), (string)($_GET['part'] ?? ''));
    header('Content-Type: ' . $file['mime']);
    header('Content-Length: ' . strlen($file['content']));
    header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($file['name']));
    header('Cache-Control: private, no-store');
    echo $file['content'];
    exit;
}

if ($action === 'mail-send' && $method === 'POST') {
    $multipart = str_starts_with(mb_strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data');
    $input = $multipart ? $_POST : eft_input(524288);
    $to = mb_substr(trim((string)($input['to'] ?? '')), 0, 190);
    $subject = mb_substr(trim((string)($input['subject'] ?? '')), 0, 240);
    $body = mb_substr(trim((string)($input['body'] ?? '')), 0, 200000);
    if ($body === '') eft_json(['ok' => false, 'code' => 'empty_message', 'message' => 'Введите текст письма.'], 422);
    $attachments = $multipart ? eft_collect_uploaded_files('attachments', 8, 8388608, 20971520) : [];
    eft_send_smtp($to, $subject ?: '(без темы)', $body, $attachments);
    eft_audit((int)$user['id'], 'mail_sent', 'mail', '', ['to' => $to, 'subject' => $subject, 'attachments' => count($attachments)]);
    eft_json(['ok' => true]);
}

if ($action === 'mail-link' && $method === 'POST') {
    $input = eft_input(65536);
    $messageKey = (string)($input['messageKey'] ?? '');
    $projectId = (string)($input['projectId'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $messageKey) || !preg_match('/^[a-f0-9-]{36}$/i', $projectId)) eft_json(['ok' => false, 'code' => 'invalid_link', 'message' => 'Не удалось связать письмо с проектом.'], 422);
    $statement = $pdo->prepare('INSERT INTO eft_mail_links (message_key, project_id, linked_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE project_id = VALUES(project_id), linked_by = VALUES(linked_by), created_at = NOW()');
    $statement->execute([$messageKey, $projectId, (int)$user['id']]);
    eft_audit((int)$user['id'], 'mail_linked', 'mail', $messageKey, ['projectId' => $projectId]);
    eft_json(['ok' => true]);
}

if ($action === 'project-number' && $method === 'POST') {
    $number = eft_next_project_number();
    eft_audit((int)$user['id'], 'project_number_reserved', 'project', $number);
    eft_json(['ok' => true, 'number' => $number], 201);
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
    $pdo->beginTransaction();
    $number = eft_next_project_number();
    $payload['meta'] = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
    $payload['meta']['projectNum'] = $number;
    $payload['meta']['date'] = (new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')))->format('Y-m-d');
    if (is_array($payload['request'] ?? null)) $payload['request']['number'] = 'КП-' . $number;
    $name = mb_substr(trim(eft_project_name($payload)), 0, 255) ?: 'Новый проект';
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
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
    $savedPayload = json_decode((string)$current['payload'], true);
    if (is_array($savedPayload['meta'] ?? null)) {
        $payload['meta'] = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
        $payload['meta']['projectNum'] = $savedPayload['meta']['projectNum'] ?? $payload['meta']['projectNum'] ?? '';
        if (is_array($payload['request'] ?? null)) $payload['request']['number'] = 'КП-' . $payload['meta']['projectNum'];
    }
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

if ($action === 'project-delete' && $method === 'POST') {
    $admin = eft_require_role(['admin']);
    $input = eft_input(65536);
    $id = (string)($input['id'] ?? '');
    $password = (string)($input['password'] ?? '');
    $statement = $pdo->prepare('SELECT password_hash FROM eft_users WHERE id = ? LIMIT 1');
    $statement->execute([(int)$admin['id']]);
    $hash = (string)$statement->fetchColumn();
    if ($password === '' || !password_verify($password, $hash)) eft_json(['ok' => false, 'code' => 'invalid_password', 'message' => 'Неверный пароль. Проект не удалён.'], 403);
    $statement = $pdo->prepare("UPDATE eft_projects SET status = 'archived', updated_by = ?, updated_at = NOW() WHERE id = ? AND status <> 'archived'");
    $statement->execute([(int)$admin['id'], $id]);
    if (!$statement->rowCount()) eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Проект не найден.'], 404);
    eft_audit((int)$admin['id'], 'project_archived', 'project', $id);
    eft_json(['ok' => true]);
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
    $statement = $pdo->prepare("SELECT q.id, q.public_number, q.status, q.customer_name, q.phone, q.email, q.payload, q.created_at, q.updated_at, IF(r.read_at IS NULL, 0, 1) AS is_read FROM eft_questionnaires q LEFT JOIN eft_intake_reads r ON r.questionnaire_id = q.id AND r.user_id = ? WHERE q.status <> 'archived' ORDER BY q.created_at DESC LIMIT 250");
    $statement->execute([(int)$user['id']]);
    $rows = $statement->fetchAll();
    $attachmentStatement = $pdo->prepare('SELECT id, original_name, mime_type, size_bytes FROM eft_questionnaire_attachments WHERE questionnaire_id = ? ORDER BY created_at');
    $unread = 0;
    foreach ($rows as &$row) {
        $row['payload'] = json_decode($row['payload'], true);
        $row['is_read'] = (bool)$row['is_read'];
        if (!$row['is_read']) $unread++;
        $attachmentStatement->execute([$row['id']]);
        $row['attachments'] = $attachmentStatement->fetchAll();
    }
    eft_json(['ok' => true, 'intakes' => $rows, 'unread' => $unread]);
}

if ($action === 'intake-read' && $method === 'POST') {
    $input = eft_input(65536);
    $id = (string)($input['id'] ?? '');
    $pdo->prepare('INSERT INTO eft_intake_reads (user_id, questionnaire_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE read_at = NOW()')->execute([(int)$user['id'], $id]);
    eft_json(['ok' => true]);
}

if ($action === 'intake-delete' && $method === 'POST') {
    $admin = eft_require_role(['admin']);
    $input = eft_input(65536);
    $id = (string)($input['id'] ?? '');
    $password = (string)($input['password'] ?? '');
    $statement = $pdo->prepare('SELECT password_hash FROM eft_users WHERE id = ? LIMIT 1');
    $statement->execute([(int)$admin['id']]);
    $hash = (string)$statement->fetchColumn();
    if ($password === '' || !password_verify($password, $hash)) eft_json(['ok' => false, 'code' => 'invalid_password', 'message' => 'Неверный пароль. Анкета не удалена.'], 403);
    $statement = $pdo->prepare("UPDATE eft_questionnaires SET status = 'archived', updated_at = NOW() WHERE id = ? AND status <> 'archived'");
    $statement->execute([$id]);
    if (!$statement->rowCount()) eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Анкета не найдена.'], 404);
    eft_audit((int)$admin['id'], 'intake_archived', 'questionnaire', $id);
    eft_json(['ok' => true]);
}

if ($action === 'attachment' && $method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    $statement = $pdo->prepare('SELECT original_name, mime_type, size_bytes, content FROM eft_questionnaire_attachments WHERE id = ? LIMIT 1');
    $statement->execute([$id]);
    $file = $statement->fetch();
    if (!$file) eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Файл не найден.'], 404);
    header('Content-Type: ' . $file['mime_type']);
    header('Content-Length: ' . (int)$file['size_bytes']);
    header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode((string)$file['original_name']));
    header('Cache-Control: private, no-store');
    echo $file['content'];
    exit;
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

if ($action === 'user-update' && $method === 'POST') {
    $admin = eft_require_role(['admin']);
    $input = eft_input(65536);
    $id = (int)($input['id'] ?? 0);
    $username = mb_strtolower(trim((string)($input['username'] ?? '')));
    $displayName = mb_substr(trim((string)($input['displayName'] ?? '')), 0, 160);
    $role = (string)($input['role'] ?? '');
    $active = ($input['active'] ?? false) === true;
    $newPassword = (string)($input['newPassword'] ?? '');
    $adminPassword = (string)($input['adminPassword'] ?? '');
    if ($id < 1 || !preg_match('/^[a-z0-9._-]{3,80}$/', $username) || $displayName === '' || !in_array($role, ['admin', 'manager', 'estimator', 'viewer'], true) || ($newPassword !== '' && strlen($newPassword) < 12)) {
        eft_json(['ok' => false, 'code' => 'invalid_user', 'message' => 'Проверьте логин, имя, роль и новый пароль (не короче 12 символов).'], 422);
    }
    $statement = $pdo->prepare('SELECT password_hash FROM eft_users WHERE id = ? LIMIT 1');
    $statement->execute([(int)$admin['id']]);
    if ($adminPassword === '' || !password_verify($adminPassword, (string)$statement->fetchColumn())) {
        eft_json(['ok' => false, 'code' => 'invalid_password', 'message' => 'Неверный пароль администратора. Изменения не сохранены.'], 403);
    }
    $pdo->beginTransaction();
    try {
        $activeAdmins = $pdo->query("SELECT id FROM eft_users WHERE role = 'admin' AND active = 1 FOR UPDATE")->fetchAll();
        $statement = $pdo->prepare('SELECT id, username, role, active FROM eft_users WHERE id = ? FOR UPDATE');
        $statement->execute([$id]);
        $existing = $statement->fetch();
        if (!$existing) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Сотрудник не найден.'], 404); }
        if ((int)$admin['id'] === $id && (!$active || $role !== 'admin')) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'self_lockout', 'message' => 'Нельзя отключить или понизить собственную учётную запись администратора.'], 422); }
        if ($existing['role'] === 'admin' && (int)$existing['active'] === 1 && (!$active || $role !== 'admin')) {
            if (count($activeAdmins) <= 1) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'last_admin', 'message' => 'Последнего активного администратора нельзя отключить.'], 422); }
        }
        $hash = $newPassword === '' ? null : password_hash($newPassword, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE eft_users SET username = ?, display_name = ?, role = ?, active = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?')->execute([$username, $displayName, $role, $active ? 1 : 0, $hash, $id]);
        $pdo->commit();
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((string)$error->getCode() === '23000') eft_json(['ok' => false, 'code' => 'duplicate_user', 'message' => 'Такой логин уже существует.'], 409);
        throw $error;
    }
    eft_audit((int)$admin['id'], 'user_updated', 'user', (string)$id, ['username' => $username, 'role' => $role, 'active' => $active, 'passwordChanged' => $newPassword !== '']);
    if ((int)$admin['id'] === $id) {
        $_SESSION = [];
        session_destroy();
        eft_json(['ok' => true, 'loggedOut' => true]);
    }
    eft_json(['ok' => true]);
}

eft_json(['ok' => false, 'code' => 'not_found', 'message' => 'Метод API не найден.'], 404);
