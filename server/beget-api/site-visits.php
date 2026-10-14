<?php
declare(strict_types=1);

function eft_site_today(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')))->format('Y-m-d');
}

function eft_record_site_visit(PDO $pdo, array &$session, string $day, int $now): bool {
    $newVisitor = ($session['site_visitor_day'] ?? '') !== $day;
    $lastVisit = (int)($session['site_last_visit_at'] ?? 0);
    $newVisit = $newVisitor || $lastVisit <= $now - 1800;
    if (!$newVisit) return false;

    $statement = $pdo->prepare('INSERT INTO eft_site_daily_stats (visit_date, visits, visitors) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE visits = visits + 1, visitors = visitors + ?');
    $statement->execute([$day, $newVisitor ? 1 : 0, $newVisitor ? 1 : 0]);
    $session['site_visitor_day'] = $day;
    $session['site_last_visit_at'] = $now;
    return true;
}

function eft_site_stats(PDO $pdo, string $today): array {
    $date = new DateTimeImmutable($today, new DateTimeZone('Europe/Moscow'));
    $start = $date->modify('-29 days');
    $statement = $pdo->prepare('SELECT visit_date, visits, visitors FROM eft_site_daily_stats WHERE visit_date BETWEEN ? AND ? ORDER BY visit_date ASC');
    $statement->execute([$start->format('Y-m-d'), $today]);
    $allTime = (int)$pdo->query('SELECT COALESCE(SUM(visits), 0) FROM eft_site_daily_stats')->fetchColumn();
    $byDay = [];
    foreach ($statement->fetchAll() as $row) $byDay[$row['visit_date']] = $row;

    $days = [];
    $last7 = ['visits' => 0, 'visitors' => 0];
    $last30 = ['visits' => 0, 'visitors' => 0];
    for ($offset = 29; $offset >= 0; $offset--) {
        $key = $date->modify('-' . $offset . ' days')->format('Y-m-d');
        $day = [
            'date' => $key,
            'visits' => (int)($byDay[$key]['visits'] ?? 0),
            'visitors' => (int)($byDay[$key]['visitors'] ?? 0),
        ];
        $days[] = $day;
        $last30['visits'] += $day['visits'];
        $last30['visitors'] += $day['visitors'];
        if ($offset < 7) {
            $last7['visits'] += $day['visits'];
            $last7['visitors'] += $day['visitors'];
        }
    }
    return [
        'timezone' => 'Europe/Moscow',
        'allTimeVisits' => $allTime,
        'today' => $days[29],
        'last7' => $last7,
        'last30' => $last30,
        'days' => $days,
    ];
}
