export const KNOWLEDGE_TRANSFER_FORMAT = 'eft-knowledge-library';
export const KNOWLEDGE_TRANSFER_VERSION = 1;

const DB_NAME = 'eft-knowledge-library';
const DB_VERSION = 1;
const STORE = 'articles';
const FALLBACK_KEY = 'eft-knowledge-library-fallback-v1';
const HIDDEN_KEY = 'eft-knowledge-hidden-v1';

function cleanText(value, limit = 500) {
  return String(value ?? '').trim().slice(0, limit);
}

function cleanCell(value) {
  return cleanText(value, 500);
}

function cleanImage(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('./knowledge/')) ? value : '';
}

function normalizeSections(rawSections) {
  if (!Array.isArray(rawSections)) return [];
  return rawSections.slice(0, 20).map(section => ({
    title: cleanText(section?.title, 200),
    content: Array.isArray(section?.content) ? section.content.map(value => cleanText(value, 2000)).filter(Boolean).slice(0, 12) : [],
    steps: Array.isArray(section?.steps) ? section.steps.map(value => cleanText(value, 1000)).filter(Boolean).slice(0, 24) : [],
    image: cleanImage(section?.image),
    imageAlt: cleanText(section?.imageAlt, 300),
  })).filter(section => section.title || section.content.length || section.steps.length || section.image);
}

export function normalizeKnowledgeArticle(raw = {}) {
  const now = new Date().toISOString();
  const rows = Array.isArray(raw.table?.rows)
    ? raw.table.rows.slice(0, 100).map(row => (Array.isArray(row) ? row.slice(0, 4).map(cleanCell) : []))
    : [];
  const headers = Array.isArray(raw.table?.headers)
    ? raw.table.headers.slice(0, 4).map(cleanCell)
    : ['Параметр', 'Значение', 'Примечание'];
  const content = Array.isArray(raw.content)
    ? raw.content.map(cleanCell).filter(Boolean).slice(0, 30)
    : String(raw.content || '').split(/\r?\n\s*\r?\n/).map(cleanCell).filter(Boolean).slice(0, 30);
  return {
    id: cleanCell(raw.id) || `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    builtIn: false,
    category: cleanCell(raw.category) || 'custom',
    title: cleanCell(raw.title) || 'Новый материал',
    summary: cleanCell(raw.summary),
    content,
    image: cleanImage(raw.image),
    sections: normalizeSections(raw.sections),
    table: { headers, rows },
    tags: Array.isArray(raw.tags) ? raw.tags.map(cleanCell).filter(Boolean).slice(0, 12) : String(raw.tags || '').split(',').map(cleanCell).filter(Boolean).slice(0, 12),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

function fallbackRead() {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]').map(normalizeKnowledgeArticle); } catch { return []; }
}

function fallbackWrite(articles) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(articles));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB недоступен'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть библиотеку'));
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ошибка библиотеки'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Ошибка сохранения')); };
  });
}

export async function listKnowledgeArticles() {
  try {
    const rows = await withStore('readonly', store => store.getAll());
    return rows.map(normalizeKnowledgeArticle).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch {
    return fallbackRead();
  }
}

export async function saveKnowledgeArticle(article) {
  const normalized = normalizeKnowledgeArticle({ ...article, updatedAt: new Date().toISOString() });
  try {
    await withStore('readwrite', store => store.put(normalized));
  } catch {
    const rows = fallbackRead().filter(item => item.id !== normalized.id);
    fallbackWrite([normalized, ...rows]);
  }
  return normalized;
}

export async function deleteKnowledgeArticle(id) {
  try {
    await withStore('readwrite', store => store.delete(id));
  } catch {
    fallbackWrite(fallbackRead().filter(item => item.id !== id));
  }
}

export function getHiddenKnowledgeIds() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]').filter(Boolean); } catch { return []; }
}

export function setHiddenKnowledgeIds(ids) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(ids)]));
}

export function createKnowledgeTransfer(articles) {
  return {
    format: KNOWLEDGE_TRANSFER_FORMAT,
    version: KNOWLEDGE_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    articles: articles.map(article => ({ ...article, builtIn: false })),
  };
}

export function parseKnowledgeTransfer(raw) {
  if (raw?.format !== KNOWLEDGE_TRANSFER_FORMAT || !Array.isArray(raw.articles)) throw new Error('Это не файл библиотеки знаний ЭФТ');
  if (raw.articles.length > 200) throw new Error('В файле слишком много материалов');
  return raw.articles.map((article, index) => normalizeKnowledgeArticle({
    ...article,
    id: article.id?.startsWith('builtin-') ? `imported-${Date.now()}-${index}` : article.id,
  }));
}

export function downloadKnowledgeTransfer(articles, fileName = 'Библиотека_знаний_ЭФТ.eft-knowledge.json') {
  const blob = new Blob([JSON.stringify(createKnowledgeTransfer(articles), null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export async function resizeKnowledgeImage(file, maxSide = 1600) {
  if (!file?.type?.startsWith('image/')) throw new Error('Выберите изображение');
  if (file.size > 12 * 1024 * 1024) throw new Error('Изображение больше 12 МБ');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Не удалось открыть изображение'));
    element.src = source;
  });
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}
