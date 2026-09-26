<?php
declare(strict_types=1);

function eft_mail_config(): array {
    $path = __DIR__ . '/mail.local.php';
    if (!is_file($path)) return ['configured' => false];
    $config = require $path;
    return is_array($config) ? array_merge(['configured' => true], $config) : ['configured' => false];
}

function eft_mail_ready(): array {
    $config = eft_mail_config();
    return [
        'configured' => !empty($config['configured']) && !empty($config['username']) && !empty($config['password']),
        'imapAvailable' => function_exists('imap_open'),
        'address' => (string)($config['username'] ?? 'sale@eftsip.ru'),
    ];
}

function eft_mailbox_root(): string {
    $config = eft_mail_config();
    return '{' . ($config['imap_host'] ?? 'imap.mail.ru') . ':' . (int)($config['imap_port'] ?? 993) . '/imap/ssl}';
}

function eft_mailbox(bool $readOnly = true, string $folder = 'INBOX', bool $failHard = true) {
    $state = eft_mail_ready();
    if (!$state['configured']) { if ($failHard) eft_json(['ok' => false, 'code' => 'mail_not_configured', 'message' => 'Почта ещё не подключена.'], 503); return false; }
    if (!$state['imapAvailable']) { if ($failHard) eft_json(['ok' => false, 'code' => 'imap_unavailable', 'message' => 'На сервере Beget не включено расширение PHP IMAP.'], 503); return false; }
    $config = eft_mail_config();
    if ($folder === '' || preg_match('/[\x00-\x1f{}]/', $folder)) eft_json(['ok' => false, 'code' => 'invalid_mail_folder', 'message' => 'Папка почты не найдена.'], 404);
    $mailbox = eft_mailbox_root() . $folder;
    $flags = $readOnly && defined('OP_READONLY') ? OP_READONLY : 0;
    $stream = @imap_open($mailbox, (string)$config['username'], (string)$config['password'], $flags, 1);
    if (!$stream) {
        error_log('EFT IMAP connection failed: ' . (imap_last_error() ?: 'unknown'));
        if ($failHard) eft_json(['ok' => false, 'code' => 'mail_connection_failed', 'message' => 'Не удалось подключиться к почте. Проверьте пароль приложения.'], 503);
        return false;
    }
    return $stream;
}

function eft_decode_imap_folder(string $value): string {
    return preg_replace_callback('/&([^-]*)-/', function (array $match): string {
        if ($match[1] === '') return '&';
        $base64 = str_replace(',', '/', $match[1]);
        $base64 .= str_repeat('=', (4 - strlen($base64) % 4) % 4);
        $decoded = base64_decode($base64, true);
        return $decoded === false ? $match[0] : mb_convert_encoding($decoded, 'UTF-8', 'UTF-16BE');
    }, $value) ?? $value;
}

function eft_mail_folder_key(string $folder): string {
    return rtrim(strtr(base64_encode($folder), '+/', '-_'), '=');
}

function eft_mail_folder_kind(string $name): string {
    $value = mb_strtolower($name);
    if ($value === 'inbox' || preg_match('/входящ/u', $value)) return 'inbox';
    if (preg_match('/sent|отправ/u', $value)) return 'sent';
    if (preg_match('/draft|чернов/u', $value)) return 'drafts';
    if (preg_match('/archive|архив/u', $value)) return 'archive';
    if (preg_match('/spam|спам|нежелат/u', $value)) return 'spam';
    if (preg_match('/trash|deleted|корзин|удал[её]н/u', $value)) return 'trash';
    return 'other';
}

function eft_mail_folders(bool $failHard = true): array {
    $stream = eft_mailbox(true, 'INBOX', $failHard);
    if (!$stream) return [];
    $root = eft_mailbox_root();
    $listed = imap_getmailboxes($stream, $root, '*') ?: [];
    $folders = [];
    foreach ($listed as $mailbox) {
        if (((int)($mailbox->attributes ?? 0) & LATT_NOSELECT) === LATT_NOSELECT) continue;
        $fullName = (string)($mailbox->name ?? '');
        $rawName = strpos($fullName, $root) === 0 ? substr($fullName, strlen($root)) : $fullName;
        if ($rawName === '') continue;
        $displayName = eft_decode_imap_folder($rawName);
        $kind = eft_mail_folder_kind($displayName);
        $status = @imap_status($stream, $root . $rawName, SA_MESSAGES | SA_UNSEEN);
        $labels = ['inbox' => 'Входящие', 'sent' => 'Отправленные', 'drafts' => 'Черновики', 'archive' => 'Архив', 'spam' => 'Спам', 'trash' => 'Корзина'];
        $folders[] = [
            'key' => eft_mail_folder_key($rawName),
            'name' => $labels[$kind] ?? $displayName,
            'kind' => $kind,
            'total' => (int)($status->messages ?? 0),
            'unread' => (int)($status->unseen ?? 0),
            '_raw' => $rawName,
        ];
    }
    imap_close($stream);
    $priority = ['inbox' => 0, 'sent' => 1, 'drafts' => 2, 'archive' => 3, 'spam' => 4, 'trash' => 5, 'other' => 6];
    usort($folders, function (array $left, array $right) use ($priority): int {
        $order = ($priority[$left['kind']] ?? 9) <=> ($priority[$right['kind']] ?? 9);
        return $order !== 0 ? $order : strcasecmp($left['name'], $right['name']);
    });
    return $folders;
}

function eft_mail_folder(string $key): array {
    $folders = eft_mail_folders();
    if ($key === '' || $key === 'inbox') {
        foreach ($folders as $folder) if ($folder['kind'] === 'inbox') return $folder;
    }
    foreach ($folders as $folder) if (hash_equals($folder['key'], $key)) return $folder;
    eft_json(['ok' => false, 'code' => 'mail_folder_not_found', 'message' => 'Папка почты не найдена.'], 404);
}

function eft_decode_mail_header(string $value): string {
    if ($value === '') return '';
    $parts = imap_mime_header_decode($value);
    $decoded = '';
    foreach ($parts as $part) {
        $text = (string)$part->text;
        $charset = strtoupper((string)$part->charset);
        if ($charset !== 'DEFAULT' && $charset !== 'UTF-8') $text = mb_convert_encoding($text, 'UTF-8', $charset);
        $decoded .= $text;
    }
    return trim($decoded);
}

function eft_extract_email(string $address): string {
    if (preg_match('/<([^>]+)>/', $address, $match)) return strtolower(trim($match[1]));
    return strtolower(trim($address));
}

function eft_message_key(string $mailbox, int $uid): string {
    $address = strtolower((string)(eft_mail_config()['username'] ?? ''));
    if ($address === 'info@eftsip.ru') return hash('sha256', $mailbox . ':' . $uid);
    return hash('sha256', $address . ':' . $mailbox . ':' . $uid);
}

function eft_mail_overview(int $limit = 50, int $offset = 0, string $query = '', string $folderKey = 'inbox'): array {
    $folder = eft_mail_folder($folderKey);
    $stream = eft_mailbox(true, $folder['_raw']);
    $criteria = $query !== '' ? 'TEXT "' . addcslashes($query, '"\\') . '"' : 'ALL';
    $uids = imap_search($stream, $criteria, SE_UID, 'UTF-8') ?: [];
    rsort($uids, SORT_NUMERIC);
    $total = count($uids);
    $page = array_slice($uids, max(0, $offset), max(1, min(100, $limit)));
    $messages = [];
    foreach ($page as $uid) {
        $overview = imap_fetch_overview($stream, (string)$uid, FT_UID)[0] ?? null;
        if (!$overview) continue;
        $key = eft_message_key($folder['_raw'], (int)$uid);
        $messages[] = [
            'uid' => (int)$uid,
            'key' => $key,
            'subject' => eft_decode_mail_header((string)($overview->subject ?? '(без темы)')),
            'from' => eft_decode_mail_header((string)($overview->from ?? '')),
            'fromEmail' => eft_extract_email(eft_decode_mail_header((string)($overview->from ?? ''))),
            'date' => isset($overview->udate) ? gmdate('c', (int)$overview->udate) : (string)($overview->date ?? ''),
            'seen' => !empty($overview->seen),
            'answered' => !empty($overview->answered),
            'size' => (int)($overview->size ?? 0),
            'folder' => $folder['key'],
        ];
    }
    imap_close($stream);
    $links = [];
    if ($messages) {
        $keys = array_column($messages, 'key');
        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $statement = eft_db()->prepare("SELECT l.message_key, l.project_id, p.name AS project_name FROM eft_mail_links l JOIN eft_projects p ON p.id = l.project_id WHERE l.message_key IN ($placeholders)");
        $statement->execute($keys);
        foreach ($statement->fetchAll() as $row) $links[$row['message_key']] = ['id' => $row['project_id'], 'name' => $row['project_name']];
    }
    foreach ($messages as &$message) $message['project'] = $links[$message['key']] ?? null;
    unset($folder['_raw']);
    return ['messages' => $messages, 'total' => $total, 'folder' => $folder];
}

function eft_mail_unread_count(): int {
    $stream = eft_mailbox(true);
    $uids = imap_search($stream, 'UNSEEN', SE_UID) ?: [];
    imap_close($stream);
    return count($uids);
}

function eft_mail_structure_parts($structure, string $prefix = ''): array {
    $result = [];
    $parts = !empty($structure->parts) ? $structure->parts : [];
    foreach ($parts as $index => $part) {
        $number = $prefix === '' ? (string)($index + 1) : $prefix . '.' . ($index + 1);
        if (!empty($part->parts)) $result = array_merge($result, eft_mail_structure_parts($part, $number));
        $parameters = [];
        foreach (array_merge($part->parameters ?? [], $part->dparameters ?? []) as $parameter) $parameters[strtolower((string)$parameter->attribute)] = eft_decode_mail_header((string)$parameter->value);
        $filename = $parameters['filename'] ?? $parameters['name'] ?? '';
        $result[] = ['part' => $number, 'type' => (int)$part->type, 'subtype' => strtolower((string)($part->subtype ?? '')), 'encoding' => (int)$part->encoding, 'filename' => $filename, 'bytes' => (int)($part->bytes ?? 0), 'disposition' => strtolower((string)($part->disposition ?? ''))];
    }
    if (!$parts) $result[] = ['part' => '1', 'type' => (int)$structure->type, 'subtype' => strtolower((string)($structure->subtype ?? '')), 'encoding' => (int)$structure->encoding, 'filename' => '', 'bytes' => (int)($structure->bytes ?? 0), 'disposition' => ''];
    return $result;
}

function eft_decode_mail_part(string $content, int $encoding): string {
    if ($encoding === 3) return base64_decode($content, true) ?: '';
    if ($encoding === 4) return quoted_printable_decode($content);
    return $content;
}

function eft_mail_message(int $uid, bool $markSeen = true, string $folderKey = 'inbox'): array {
    $folder = eft_mail_folder($folderKey);
    $stream = eft_mailbox(!$markSeen, $folder['_raw']);
    $overview = imap_fetch_overview($stream, (string)$uid, FT_UID)[0] ?? null;
    if (!$overview) { imap_close($stream); eft_json(['ok' => false, 'code' => 'mail_not_found', 'message' => 'Письмо не найдено.'], 404); }
    $structure = imap_fetchstructure($stream, $uid, FT_UID);
    $parts = eft_mail_structure_parts($structure);
    $plain = '';
    $html = '';
    $attachments = [];
    foreach ($parts as $part) {
        if ($part['filename'] !== '' || $part['disposition'] === 'attachment') {
            $attachments[] = ['part' => $part['part'], 'name' => $part['filename'] ?: 'Вложение', 'mime' => ($part['type'] === 0 ? 'text' : 'application') . '/' . ($part['subtype'] ?: 'octet-stream'), 'size' => $part['bytes']];
            continue;
        }
        if ($part['type'] !== 0) continue;
        $content = eft_decode_mail_part((string)imap_fetchbody($stream, $uid, $part['part'], FT_UID | FT_PEEK), $part['encoding']);
        if ($part['subtype'] === 'plain' && $plain === '') $plain = $content;
        if ($part['subtype'] === 'html' && $html === '') $html = $content;
    }
    if ($markSeen) imap_setflag_full($stream, (string)$uid, '\\Seen', ST_UID);
    imap_close($stream);
    $body = trim($plain !== '' ? $plain : strip_tags($html));
    return [
        'uid' => $uid,
        'key' => eft_message_key($folder['_raw'], $uid),
        'folder' => $folder['key'],
        'subject' => eft_decode_mail_header((string)($overview->subject ?? '(без темы)')),
        'from' => eft_decode_mail_header((string)($overview->from ?? '')),
        'fromEmail' => eft_extract_email(eft_decode_mail_header((string)($overview->from ?? ''))),
        'to' => eft_decode_mail_header((string)($overview->to ?? '')),
        'date' => isset($overview->udate) ? gmdate('c', (int)$overview->udate) : (string)($overview->date ?? ''),
        'body' => mb_substr($body, 0, 200000),
        'attachments' => $attachments,
    ];
}

function eft_mail_attachment(int $uid, string $partNumber, string $folderKey = 'inbox'): array {
    if (!preg_match('/^\d+(?:\.\d+)*$/', $partNumber)) eft_json(['ok' => false, 'code' => 'invalid_part', 'message' => 'Некорректное вложение.'], 422);
    $folder = eft_mail_folder($folderKey);
    $stream = eft_mailbox(true, $folder['_raw']);
    $structure = imap_fetchstructure($stream, $uid, FT_UID);
    $parts = eft_mail_structure_parts($structure);
    foreach ($parts as $part) {
        if ($part['part'] !== $partNumber || ($part['filename'] === '' && $part['disposition'] !== 'attachment')) continue;
        $content = eft_decode_mail_part((string)imap_fetchbody($stream, $uid, $partNumber, FT_UID | FT_PEEK), $part['encoding']);
        imap_close($stream);
        return ['name' => $part['filename'] ?: 'attachment', 'mime' => ($part['type'] === 0 ? 'text' : 'application') . '/' . ($part['subtype'] ?: 'octet-stream'), 'content' => $content];
    }
    imap_close($stream);
    eft_json(['ok' => false, 'code' => 'attachment_not_found', 'message' => 'Вложение не найдено.'], 404);
}

function eft_smtp_read($socket): string {
    $response = '';
    while (($line = fgets($socket, 4096)) !== false) { $response .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
    return $response;
}

function eft_smtp_command($socket, string $command, array $accepted): void {
    fwrite($socket, $command . "\r\n");
    $response = eft_smtp_read($socket);
    if (!in_array((int)substr($response, 0, 3), $accepted, true)) throw new RuntimeException('SMTP rejected command: ' . substr($response, 0, 160));
}

function eft_smtp_authenticated_socket() {
    $config = eft_mail_config();
    if (empty($config['configured'])) throw new RuntimeException('Почта ещё не подключена.');
    $host = (string)($config['smtp_host'] ?? 'smtp.mail.ru');
    $port = (int)($config['smtp_port'] ?? 465);
    $socket = @stream_socket_client("ssl://{$host}:{$port}", $errorNumber, $errorText, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) throw new RuntimeException('SMTP connection failed: ' . $errorText);
    stream_set_timeout($socket, 20);
    eft_smtp_read($socket);
    eft_smtp_command($socket, 'EHLO eftsip.ru', [250]);
    eft_smtp_command($socket, 'AUTH LOGIN', [334]);
    eft_smtp_command($socket, base64_encode((string)$config['username']), [334]);
    eft_smtp_command($socket, base64_encode((string)$config['password']), [235]);
    return $socket;
}

function eft_smtp_connection_check(): void {
    $socket = eft_smtp_authenticated_socket();
    eft_smtp_command($socket, 'QUIT', [221]);
    fclose($socket);
}

function eft_build_mail_message(string $to, string $subject, string $body, array $attachments = []): string {
    $config = eft_mail_config();
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $messageId = '<' . bin2hex(random_bytes(16)) . '@eftsip.ru>';
    $headers = "Date: " . date(DATE_RFC2822) . "\r\nMessage-ID: {$messageId}\r\nFrom: EFT <{$config['username']}>\r\n";
    if ($to !== '') $headers .= "To: <{$to}>\r\n";
    $headers .= "Subject: {$encodedSubject}\r\nMIME-Version: 1.0\r\n";
    if (!$attachments) {
        $message = $headers . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
    } else {
        $boundary = 'eft_' . bin2hex(random_bytes(18));
        $message = $headers . "Content-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n\r\n";
        $message .= "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
        foreach ($attachments as $file) {
            $safeName = str_replace(["\r", "\n", '"'], ['', '', "'"], (string)$file['name']);
            $encodedName = rawurlencode($safeName);
            $message .= "\r\n--{$boundary}\r\nContent-Type: " . (string)$file['type'] . "; name*=UTF-8''{$encodedName}\r\n";
            $message .= "Content-Disposition: attachment; filename*=UTF-8''{$encodedName}\r\nContent-Transfer-Encoding: base64\r\n\r\n";
            $message .= chunk_split(base64_encode((string)$file['content']), 76, "\r\n");
        }
        $message .= "\r\n--{$boundary}--\r\n";
    }
    return $message;
}

function eft_mail_special_folder(string $kind): ?array {
    foreach (eft_mail_folders(false) as $folder) if ($folder['kind'] === $kind) return $folder;
    $createName = $kind === 'sent' ? 'Sent' : ($kind === 'drafts' ? 'Drafts' : '');
    if ($createName === '') return null;
    $stream = eft_mailbox(false, 'INBOX', false);
    if (!$stream) return null;
    @imap_createmailbox($stream, eft_mailbox_root() . $createName);
    imap_close($stream);
    foreach (eft_mail_folders(false) as $folder) if ($folder['kind'] === $kind) return $folder;
    return null;
}

function eft_append_mail_message(string $kind, string $message, string $flags): bool {
    $folder = eft_mail_special_folder($kind);
    if (!$folder) return false;
    $stream = eft_mailbox(false, 'INBOX', false);
    if (!$stream) return false;
    $result = @imap_append($stream, eft_mailbox_root() . $folder['_raw'], $message, $flags);
    if (!$result) error_log('EFT IMAP append failed (' . $kind . '): ' . (imap_last_error() ?: 'unknown'));
    imap_close($stream);
    return (bool)$result;
}

function eft_save_mail_draft(string $to, string $subject, string $body, array $attachments = []): bool {
    if ($to !== '' && (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to))) eft_json(['ok' => false, 'code' => 'invalid_recipient', 'message' => 'Проверьте адрес получателя.'], 422);
    if (preg_match('/[\r\n]/', $subject)) eft_json(['ok' => false, 'code' => 'invalid_subject', 'message' => 'Проверьте тему письма.'], 422);
    return eft_append_mail_message('drafts', eft_build_mail_message($to, $subject ?: '(без темы)', $body, $attachments), '\\Draft');
}

function eft_send_smtp(string $to, string $subject, string $body, array $attachments = []): void {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to . $subject)) eft_json(['ok' => false, 'code' => 'invalid_recipient', 'message' => 'Проверьте адрес получателя и тему.'], 422);
    $config = eft_mail_config();
    $message = eft_build_mail_message($to, $subject, $body, $attachments);
    $socket = eft_smtp_authenticated_socket();
    eft_smtp_command($socket, 'MAIL FROM:<' . $config['username'] . '>', [250]);
    eft_smtp_command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
    eft_smtp_command($socket, 'DATA', [354]);
    $smtpMessage = preg_replace('/(?m)^\./', '..', $message) ?? $message;
    fwrite($socket, $smtpMessage . "\r\n.\r\n");
    $response = eft_smtp_read($socket);
    if ((int)substr($response, 0, 3) !== 250) throw new RuntimeException('SMTP did not accept message.');
    eft_smtp_command($socket, 'QUIT', [221]);
    fclose($socket);
    if (!eft_append_mail_message('sent', $message, '\\Seen')) error_log('EFT sent message was accepted by SMTP but not copied to Sent.');
}
