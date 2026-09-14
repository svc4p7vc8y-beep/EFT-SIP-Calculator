<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail-client.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(404); exit; }
$provided = (string)($_SERVER['HTTP_X_EFT_SETUP_TOKEN'] ?? '');
if ($provided === '' || !hash_equals((string)(eft_config()['setup_token'] ?? ''), $provided)) {
    eft_json(['ok' => false, 'message' => 'Forbidden'], 403);
}
$state = eft_mail_ready();
if (!$state['configured'] || !$state['imapAvailable']) eft_json(['ok' => false, 'mail' => $state, 'message' => 'Mail integration is not ready.'], 503);
$stream = eft_mailbox(true);
$status = imap_status($stream, '{' . (eft_mail_config()['imap_host'] ?? 'imap.mail.ru') . ':' . (int)(eft_mail_config()['imap_port'] ?? 993) . '/imap/ssl}INBOX', SA_MESSAGES | SA_UNSEEN);
imap_close($stream);
eft_smtp_connection_check();
eft_json(['ok' => true, 'mail' => $state, 'imap' => true, 'smtp' => true, 'messages' => (int)($status->messages ?? 0), 'unseen' => (int)($status->unseen ?? 0)]);
