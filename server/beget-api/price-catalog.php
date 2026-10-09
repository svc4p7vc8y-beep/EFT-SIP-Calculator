<?php
declare(strict_types=1);

function eft_price_can_edit(array $user): bool {
    if ($user['role'] === 'viewer') return false;
    return !empty($_SESSION['price_editor_unlocked']) || ($user['role'] === 'admin' && empty($_SESSION['price_editor_locked']));
}

function eft_price_require_edit(array $user): void {
    if (!eft_price_can_edit($user)) eft_json(['ok' => false, 'code' => 'price_editor_locked', 'message' => 'Разблокируйте редактор общего прайса.'], 403);
}

function eft_price_seed(PDO $pdo): void {
    $owner = $pdo->query("SELECT id FROM eft_users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1")->fetchColumn();
    if (!$owner) return;
    $seed = file_get_contents(__DIR__ . '/price-catalog.seed.json');
    if (!$seed) throw new RuntimeException('Missing price catalog seed');
    $statement = $pdo->prepare("INSERT IGNORE INTO eft_shared_documents (document_key, revision, payload, updated_by) VALUES ('price-catalog', 1, ?, ?)");
    $statement->execute([$seed, (int)$owner]);
}

function eft_price_read(PDO $pdo): array {
    $statement = $pdo->query("SELECT d.revision, d.payload, d.updated_at, u.display_name AS updated_by FROM eft_shared_documents d JOIN eft_users u ON u.id = d.updated_by WHERE d.document_key = 'price-catalog'");
    $row = $statement->fetch();
    if (!$row) {
        eft_price_seed($pdo);
        $row = $pdo->query("SELECT d.revision, d.payload, d.updated_at, u.display_name AS updated_by FROM eft_shared_documents d JOIN eft_users u ON u.id = d.updated_by WHERE d.document_key = 'price-catalog'")->fetch();
        if (!$row) throw new RuntimeException('Price catalog could not be initialized');
    }
    return ['revision' => (int)$row['revision'], 'payload' => json_decode($row['payload'], true), 'updatedAt' => $row['updated_at'], 'updatedBy' => $row['updated_by']];
}

function eft_price_project(PDO $pdo, array $payload): array {
    $catalog = eft_price_read($pdo);
    $payload['priceMat'] = $catalog['payload']['priceMat'];
    $payload['priceLab'] = $catalog['payload']['priceLab'];
    $payload['sharedPriceCatalog'] = ['revision' => $catalog['revision'], 'source' => 'server'];
    return $payload;
}

function eft_price_row(array $row, string $key, string $id): array {
    if (!preg_match('/^[A-Za-z0-9_-]{1,100}$/', $id) || ($row['id'] ?? '') !== $id || !isset($row['price']) || !is_numeric($row['price']) || !is_finite((float)$row['price']) || (float)$row['price'] < 0 || (float)$row['price'] > 1000000000) {
        eft_json(['ok' => false, 'code' => 'invalid_price', 'message' => 'Укажите корректный код и цену от 0 до 1 млрд рублей.'], 422);
    }
    foreach (['name' => 300, 'cat' => 120, 'unit' => 30] as $field => $limit) {
        if (!is_string($row[$field] ?? null) || trim($row[$field]) === '' || mb_strlen($row[$field]) > $limit) eft_json(['ok' => false, 'code' => 'invalid_price_row', 'message' => 'Заполните название, категорию и единицу измерения.'], 422);
    }
    $row['kind'] = $key === 'priceMat' ? 'material' : 'labor';
    $row['price'] = round((float)$row['price'], 2);
    $row['pricePending'] = $row['price'] <= 0;
    unset($row['priceEstimated'], $row['priceNote']);
    return $row;
}

function eft_price_update(PDO $pdo, array $user, array $input): array {
    $changes = $input['changes'] ?? null;
    if (!is_array($changes) || !$changes || count($changes) > 2000) eft_json(['ok' => false, 'code' => 'invalid_changes', 'message' => 'Нет корректных изменений прайса.'], 422);
    // Validate before locking: bad input must not leave a partially saved catalog.
    $unique = [];
    foreach ($changes as &$change) {
        $key = (string)($change['key'] ?? ''); $id = (string)($change['id'] ?? '');
        if (!in_array($key, ['priceMat','priceLab'], true) || !is_array($change['after'] ?? null) || isset($unique[$id])) eft_json(['ok' => false, 'code' => 'invalid_changes', 'message' => 'Некорректные или повторные позиции прайса.'], 422);
        $unique[$id] = true;
        $change['after'] = eft_price_row($change['after'], $key, $id);
    }
    unset($change);
    eft_price_read($pdo);
    $pdo->beginTransaction();
    $stored = $pdo->query("SELECT revision, payload FROM eft_shared_documents WHERE document_key = 'price-catalog' FOR UPDATE")->fetch();
    $payload = json_decode($stored['payload'], true);
    $revision = (int)$stored['revision'];
    $saved = [];
    foreach ($changes as $change) {
        $key = $change['key']; $id = $change['id']; $position = null; $old = null;
        foreach ($payload[$key] as $i => $row) if ($row['id'] === $id) { $position = $i; $old = $row; break; }
        // Compare the actual row, allowing disjoint edits from different revisions.
        if ($old != ($change['before'] ?? null)) {
            $pdo->rollBack();
            eft_json(['ok' => false, 'code' => 'price_conflict', 'message' => 'Эта позиция уже изменена другим сотрудником. Обновите прайс и проверьте новую цену.', 'catalogId' => $id, 'currentRevision' => $revision], 409);
        }
        if ($old && $old['unit'] !== $change['after']['unit']) {
            $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'unit_change_forbidden', 'message' => 'Единица существующей позиции связана с расчётами. Создайте новую позицию для другой единицы.'], 422);
        }
        if ($old && $old['name'] !== $change['after']['name']) {
            $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'catalog_identity_change_forbidden', 'message' => 'Название существующей позиции связано с расчётами и не меняется импортом прайса. Создайте отдельную позицию.'], 422);
        }
        $other = $key === 'priceMat' ? 'priceLab' : 'priceMat';
        foreach ($payload[$other] as $row) if ($row['id'] === $id) { $pdo->rollBack(); eft_json(['ok' => false, 'code' => 'duplicate_catalog_id', 'message' => 'Код уже используется в другом разделе.'], 422); }
        if ($old == $change['after']) continue;
        if ($position === null) $payload[$key][] = $change['after']; else $payload[$key][$position] = $change['after'];
        $saved[] = [$key, $id, $old, $change['after']];
    }
    if ($saved) {
        ++$revision;
        $statement = $pdo->prepare("UPDATE eft_shared_documents SET revision = ?, payload = ?, updated_by = ?, updated_at = NOW() WHERE document_key = 'price-catalog'");
        $statement->execute([$revision, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), (int)$user['id']]);
        $history = $pdo->prepare('INSERT INTO eft_price_history (revision, catalog_key, catalog_id, before_row, after_row, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())');
        foreach ($saved as [$key, $id, $old, $after]) $history->execute([$revision, $key, $id, $old === null ? null : json_encode($old, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), json_encode($after, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), (int)$user['id']]);
    }
    $pdo->commit();
    return eft_price_read($pdo);
}
