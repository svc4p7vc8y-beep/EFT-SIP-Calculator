<?php
declare(strict_types=1);

return [
    'db_host' => 'localhost',
    'db_name' => 'mishin7t_eftcrm',
    'db_user' => 'mishin7t_eftcrm',
    'db_password' => 'CHANGE_ME',
    // Keep the existing shared login on EFT domains. Use '' for a host-only
    // session when testing the API on a hosting provider's technical domain.
    'cookie_domain' => '.eftsip.ru',
    'app_secret' => 'CHANGE_TO_A_LONG_RANDOM_VALUE',
    'setup_token' => 'CHANGE_TO_A_DIFFERENT_RANDOM_VALUE',
    'allowed_origins' => [
        'https://eftsip.ru',
        'https://www.eftsip.ru',
        'https://calc.eftsip.ru',
        'https://svc4p7vc8y-beep.github.io',
    ],
];
