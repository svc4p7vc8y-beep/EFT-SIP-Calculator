<?php
declare(strict_types=1);

require getcwd() . '/bootstrap.php';

$pdo = eft_db();
try {
    $pdo->beginTransaction();
    eft_audit(null, 'health_probe', 'system');
    $pdo->rollBack();
    echo "EFT audit log write available\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, 'EFT audit log write failed: ' . $error->getMessage() . "\n");
    exit(1);
}
