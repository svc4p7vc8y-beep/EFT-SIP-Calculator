import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { BUILTIN_KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES } from '../src/react/data/knowledge-library.js';
import {
  createKnowledgeTransfer, normalizeKnowledgeArticle, parseKnowledgeTransfer,
} from '../src/react/storage/knowledge-library.js';

test('knowledge library contains client-ready engineering, SIP and checklist materials', async () => {
  assert.ok(BUILTIN_KNOWLEDGE_ARTICLES.length >= 9);
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

  const managerGuide = BUILTIN_KNOWLEDGE_ARTICLES.find(article => article.id === 'builtin-manager-guide');
  assert.equal(managerGuide.title, 'Полная инструкция менеджера');
  assert.ok(managerGuide.sections.length >= 10);
  assert.ok(managerGuide.sections.flatMap(section => section.steps || []).length >= 45);
  assert.doesNotMatch(JSON.stringify(managerGuide), /1455/);
  const guideImages = [managerGuide.image, ...managerGuide.sections.map(section => section.image).filter(Boolean)];
  assert.ok(guideImages.length >= 6);
  for (const imagePath of guideImages) {
    await access(new URL(`../public/${imagePath.replace(/^\.\//, '')}`, import.meta.url));
  }
});

test('knowledge transfer preserves descriptions, tables and uploaded images', () => {
  const source = normalizeKnowledgeArticle({
    id: 'my-checklist', title: 'Моя инструкция', category: 'checklists',
    summary: 'Проверка', content: ['Первый абзац', 'Второй абзац'],
    image: 'data:image/jpeg;base64,AAAA', tags: ['клиент'],
    sections: [{
      title: 'Порядок работы',
      content: ['Подробное пояснение '.repeat(40)],
      steps: ['Открыть проект', 'Проверить смету'],
      image: './knowledge/manager-guide-01-workflow.svg',
      imageAlt: 'Маршрут менеджера',
    }],
    table: { headers: ['Узел', 'Норма', 'Комментарий'], rows: [['Шов', '150 мм', 'Проверить']] },
  });
  const restored = parseKnowledgeTransfer(createKnowledgeTransfer([source]));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, source.title);
  assert.equal(restored[0].image, source.image);
  assert.deepEqual(restored[0].sections, source.sections);
  assert.ok(restored[0].sections[0].content[0].length > 500);
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
