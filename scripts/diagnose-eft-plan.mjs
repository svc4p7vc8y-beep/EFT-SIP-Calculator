import fs from 'node:fs';
import path from 'node:path';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { applyPlanTransfer } from '../src/react/storage/plan-transfer.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { resolveSipStructuralScrew } from '../src/react/calculations/sip-joinery.js';

const input = process.argv[2];
const output = process.argv[3];
if (!input) {
  console.error('Usage: node scripts/diagnose-eft-plan.mjs <file.eft-plan.json> [report.md]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const project = applyPlanTransfer(createDefaultProject(), raw);
const calculation = calculateProject(project);
const report = calculation.nodeFasteners;
const plan = project.plan;
const floors = calculation.metrics?.floorPlans || [];
const structuralRows = calculation.sip?.consumables?.rows || [];
const previousStructuralKg = structuralRows.reduce((sum, row) => {
  const screw = resolveSipStructuralScrew(row.panelThickness, project.settings.formulas);
  return sum + (Number(row.structuralCount) || 0) * screw.kgEach;
}, 0);
const currentStructuralKg = Number(calculation.sip?.consumables?.totals?.structuralKg) || 0;
const previousUnitPrice = project.priceMat.find((item) => item.name === 'Саморезы конст.')?.price || 0;
const currentStructuralCost = calculation.lines
  .filter((line) => line.section === 'sip' && line.id?.startsWith('sip:fasteners-'))
  .reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.price) || 0), 0);
const previousStructuralCost = previousStructuralKg * previousUnitPrice;
const lines = [
  `# Диагностика ${path.basename(input)}`,
  '',
  `- Исходная схема: ${raw.schemaVersion ?? 'не указана'}; импортирована как совместимая со схемой 4.`,
  `- Дом: ${plan.house.w} × ${plan.house.h} м; этажей: ${project.meta.floors}; высота стен: ${plan.wallHeight} м.`,
  `- Геометрия: помещений ${plan.rooms.length}, явных стен ${plan.walls.length}, проёмов ${plan.openings.length}, площадок ${plan.platforms.length}, рядов свай ${plan.pileRows.length}, отдельных свай ${plan.piles.length}.`,
  `- Расчётных планов этажей: ${floors.length}; режим расходников: ${report.mode}.`,
  `- Влияние разделения размеров: количество конструкционных саморезов не увеличено; расчётная масса ${previousStructuralKg.toFixed(3)} → ${currentStructuralKg.toFixed(3)} кг. При текущих ценах проекта стоимость этих строк ${Math.round(previousStructuralCost)} → ${Math.round(currentStructuralCost)} ₽ (разница ${Math.round(currentStructuralCost - previousStructuralCost)} ₽).`,
  '',
  '## Обнаруженные узлы',
  '',
  '| Тип | Количество узлов |',
  '|---|---:|',
  ...Object.entries(report.stats).map(([type, qty]) => `| ${type} | ${qty} |`),
  '',
  '## Назначенный крепёж и нормы',
  '',
  '| Раздел | Узел | Размер | Узлов | Длина, м | Шаг, м | Без запаса | С запасом | К закупке | Источник |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  ...report.rows.map((row) => `| ${row.section} | ${row.node} | ${row.size} | ${row.nodeCount} | ${row.length} | ${row.spacing ?? '—'} | ${row.calculatedQty} | ${row.withReserve} | ${row.purchaseQty} | ${row.source?.type || '—'}${row.source?.pages ? `, стр. ${row.source.pages}` : ''} |`),
  '',
  '## Сводный заказ',
  '',
  '| Крепёж | Размер | Расчёт | С запасом | К закупке |',
  '|---|---|---:|---:|---:|',
  ...report.purchase.map((item) => `| ${item.fastenerType} | ${item.size} | ${item.calculatedQty} | ${item.withReserve} | ${item.purchaseQty} |`),
  '',
  '## Формулы',
  '',
  ...report.rows.map((row) => `- **${row.node}, ${row.size}:** ${row.formula || 'формула не назначена'}.`),
  '',
  '## Требуют проверки',
  '',
  ...(report.warnings.length ? report.warnings.map((warning) => `- **${warning.severity}: ${warning.nodeType} (${warning.nodeId})** — ${warning.message}`) : ['- Предупреждений нет.']),
  '',
];

const markdown = lines.join('\n');
if (output) fs.writeFileSync(output, markdown, 'utf8');
process.stdout.write(markdown);
