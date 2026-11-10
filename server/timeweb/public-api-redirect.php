<?php
declare(strict_types=1);

// Compatibility endpoint for clients that still use eftsip.ru/api/api.php.
// Keep one calculator backend, its sessions and its uploads on calc.eftsip.ru.
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$origins = ['https://eftsip.ru', 'https://www.eftsip.ru', 'https://calc.eftsip.ru', 'https://crm.eftsip.ru', 'https://svc4p7vc8y-beep.github.io'];
header('Cache-Control: no-store');
header('Vary: Origin');
if ($origin !== '' && !in_array($origin, $origins, true)) {
    http_response_code(403);
    exit;
}
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
$query = (string)($_SERVER['QUERY_STRING'] ?? '');
if (strpbrk($query, "\r\n") !== false) {
    http_response_code(400);
    exit;
}
header('Location: https://calc.eftsip.ru/api/api.php' . ($query !== '' ? '?' . $query : ''), true, 307);
