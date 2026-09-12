const today = () => new Date().toISOString().slice(0, 10);

const cleanText = (value, fallback = '') => String(value ?? fallback).trim();
const positiveNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export function createDefaultRequest(meta = {}) {
  return {
    documentType: 'commercial',
    number: `КП-${cleanText(meta.projectNum, 'без-номера')}`,
    date: cleanText(meta.date, today()),
    customer: cleanText(meta.customer),
    address: cleanText(meta.address),
    recipient: '',
    manager: cleanText(meta.author, 'ЭФТ'),
    validDays: 14,
    paymentTerms: 'По согласованию сторон',
    deliveryTerms: 'По согласованию после проверки состава заказа',
    note: '',
    items: [],
  };
}

export function normalizeRequest(raw, meta = {}) {
  const fallback = createDefaultRequest(meta);
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...fallback,
    ...source,
    documentType: source.documentType === 'internal' ? 'internal' : 'commercial',
    number: cleanText(source.number, fallback.number),
    date: cleanText(source.date, fallback.date),
    customer: cleanText(source.customer, fallback.customer),
    address: cleanText(source.address, fallback.address),
    recipient: cleanText(source.recipient),
    manager: cleanText(source.manager, fallback.manager),
    validDays: Math.max(0, Math.round(positiveNumber(source.validDays, fallback.validDays))),
    paymentTerms: cleanText(source.paymentTerms, fallback.paymentTerms),
    deliveryTerms: cleanText(source.deliveryTerms, fallback.deliveryTerms),
    note: cleanText(source.note),
    items: Array.isArray(source.items)
      ? source.items.filter(Boolean).map((item, index) => ({
        id: cleanText(item.id, `request-item-${index + 1}`),
        catalogId: cleanText(item.catalogId) || null,
        kind: item.kind === 'labor' ? 'labor' : 'material',
        category: cleanText(item.category, 'Без категории'),
        name: cleanText(item.name, 'Позиция без названия'),
        unit: cleanText(item.unit, 'шт'),
        qty: positiveNumber(item.qty, 1),
        price: positiveNumber(item.price),
      }))
      : [],
  };
}

function newItemId() {
  return `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addCatalogItem(request, catalogItem) {
  const existing = request.items.find((item) => item.catalogId === catalogItem.id);
  if (existing) {
    existing.qty = positiveNumber(existing.qty) + 1;
    return existing;
  }
  const item = {
    id: newItemId(),
    catalogId: catalogItem.id,
    kind: catalogItem.kind === 'labor' ? 'labor' : 'material',
    category: cleanText(catalogItem.cat, 'Без категории'),
    name: cleanText(catalogItem.name, 'Позиция без названия'),
    unit: cleanText(catalogItem.unit, 'шт'),
    qty: 1,
    price: positiveNumber(catalogItem.price),
  };
  request.items.push(item);
  return item;
}

export function addCustomRequestItem(request) {
  const item = {
    id: newItemId(),
    catalogId: null,
    kind: 'material',
    category: 'Дополнительные позиции',
    name: 'Новая позиция',
    unit: 'шт',
    qty: 1,
    price: 0,
  };
  request.items.push(item);
  return item;
}

export function requestTotals(request) {
  return request.items.reduce((totals, item) => {
    const amount = positiveNumber(item.qty) * positiveNumber(item.price);
    if (item.kind === 'labor') totals.labor += amount;
    else totals.materials += amount;
    totals.total += amount;
    return totals;
  }, { materials: 0, labor: 0, total: 0 });
}

export function requestFileName(request) {
  const prefix = request.documentType === 'internal' ? 'Внутренняя_заявка' : 'Коммерческое_предложение';
  const safeNumber = cleanText(request.number, 'без_номера').replace(/[<>:"/\\|?*]+/g, '_');
  return `${prefix}_ЭФТ_${safeNumber}`;
}
