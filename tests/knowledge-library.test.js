import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { BUILTIN_KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES } from '../src/react/data/knowledge-library.js';
import {
  createKnowledgeTransfer, normalizeKnowledgeArticle, parseKnowledgeTransfer,
} from '../src/react/storage/knowledge-library.js';

test('knowledge library contains client-ready engineering, SIP and checklist materials', async () => {
  assert.ok(BUILTIN_KNOWLEDGE_ARTICLES.length >= 8);
  for (const category of ['ventilation', 'engineering', 'sip', 'checklists']) {
    assert.ok(BUILTIN_KNOWLEDGE_ARTICLES.some(article => article.category === category), category);
  }
  assert.ok(KNOWLEDGE_CATEGORIES.some(item => item.value === 'custom'));
  const ventilation = BUILTIN_KNOWLEDGE_ARTICLES.find(article => article.id === 'builtin-ventilation-solutions');
  assert.equal(ventilation.table.rows.length, 3);
  await access(new URL('../public/knowledge/ventilation-solutions.png', import.meta.url));
  const wetPoints = BUILTIN_KNOWLEDGE_ARTICLES.find(article => article.id === 'builtin-wet-points-layout');
  assert.equal(wetPoints.category, 'engineering');
  assert.ok(wetPoints.table.rows.length >= 10);
  assert.match(wetPoints.content.join(' '), /СП 30\.13330\.2020/);
  await access(new URL('../public/knowledge/wet-points-layout.svg', import.meta.url));
});

test('knowledge transfer preserves descriptions, tables and uploaded images', () => {
  const source = normalizeKnowledgeArticle({
    id: 'my-checklist', title: 'Моя инструкция', category: 'checklists',
    summary: 'Проверка', content: ['Первый абзац', 'Второй абзац'],
    image: 'data:image/jpeg;base64,AAAA', tags: ['клиент'],
    table: { headers: ['Узел', 'Норма', 'Комментарий'], rows: [['Шов', '150 мм', 'Проверить']] },
  });
  const restored = parseKnowledgeTransfer(createKnowledgeTransfer([source]));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, source.title);
  assert.equal(restored[0].image, source.image);
  assert.deepEqual(restored[0].table.rows, source.table.rows);
});

test('knowledge transfer rejects unrelated files and limits unsafe fields', () => {
  assert.throws(() => parseKnowledgeTransfer({ articles: [] }), /не файл библиотеки/i);
  const article = normalizeKnowledgeArticle({
    title: 'x'.repeat(800), image: 'https://example.com/tracker.png',
    table: { headers: ['A', 'B', 'C'], rows: Array.from({ length: 120 }, () => ['1', '2', '3']) },
  });
  assert.equal(article.title.length, 500);
  assert.equal(article.image, '');
  assert.equal(article.table.rows.length, 100);
});
