import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { METRIKA_ID } from '../src/site/analytics.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist-public');
const siteOrigin = 'https://eftsip.ru';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const projectUrl = (project) => `${siteOrigin}/projects/${encodeURIComponent(project.id)}.html`;
const money = new Intl.NumberFormat('ru-RU');
const metricaSnippet = `<script>window.ym=window.ym||function(){(ym.a=ym.a||[]).push(arguments)};ym.l=Date.now();ym(${METRIKA_ID},'init',{ssr:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,referrer:document.referrer,url:location.href});</script><script async src="https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}"></script><noscript><div><img src="https://mc.yandex.ru/watch/${METRIKA_ID}" style="position:absolute;left:-9999px" alt=""></div></noscript>`;
const withMetrica = (html) => html.replace('</head>', `${metricaSnippet}</head>`);

function lotosFinishPreview() {
  // Coordinates follow the siding in the supplied facade rendering.
  const siding = 'M48 159L54 98 71 140 84 141 83 249 48 238Z M89 143L336 151 361 168 359 237 89 247Z M365 168L443 168 442 237 365 238Z M452 166L462 165 462 157 497 155 496 231 453 232Z';
  const openings = 'M138 157H190V220H138Z M256 159H306V218H256Z M370 168H410V239H370Z';
  return `<fieldset class="finish-preview" id="siding-preview"><legend>Примерить цвет фасада</legend>
    <div class="finish-options">${[['wood','Медовое дерево'],['graphite','Графит'],['sage','Шалфей']].map(([key,label],i) => `<label><input type="radio" name="finish" value="${key}" ${i === 0 ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
    <svg viewBox="0 0 540 360" role="img" aria-label="Лотос в выбранном цвете отделки">
      <defs><mask id="siding"><path d="${siding}" fill="white"/><path d="${openings}" fill="black"/></mask></defs>
      <image href="/site-assets/lotos-render.webp" width="540" height="360"/>
      <rect class="finish-tint" width="540" height="360" mask="url(#siding)"/>
    </svg><small>Визуализация оттенка. Образец отделки согласуем отдельно.</small></fieldset>`;
}

function renderProjectPage(project) {
  const title = `${project.name} — проект ${project.tag || 'постройки'} из СИП-панелей | ЭФТ`;
  const summary = project.description || project.mood || `Проект ${project.name} от ЭФТ.`;
  const description = summary.length > 155 ? `${summary.slice(0, 152).trimEnd()}…` : summary;
  const imageUrl = `${siteOrigin}/site-assets/${encodeURIComponent(project.image)}`;
  const facts = (project.meta || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  const rooms = (project.rooms || []).map((room) => `<li>${escapeHtml(room)}</li>`).join('');
  const highlights = (project.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const priceRows = [
    ['Домокомплект', project.kitPrice],
    ['Домокомплект со сборкой', project.assembledPrice],
  ].filter(([, price]) => Number.isFinite(price) && price > 0);
  const priceSection = priceRows.length ? `<section><h2>Стоимость</h2><div class="prices">${priceRows.map(([label, price]) => `<div class="price-row"><span>${label}</span><strong>от ${money.format(price)} ₽</strong></div>`).join('')}</div><p class="note">Смета от ${escapeHtml(project.quoteDate)}. Итоговая стоимость уточняется после согласования проекта и комплектации.</p></section>` : `<section><h2>Стоимость</h2><p>Рассчитаем после уточнения комплектации и участка.</p></section>`;
  const planSection = project.planImage ? `<section><h2>Планировка</h2><img class="plan-image" loading="lazy" src="/site-assets/${encodeURIComponent(project.planImage)}" alt="Планировка проекта ${escapeHtml(project.name)}"><p class="note">${escapeHtml(project.planNote || 'Эскиз для обсуждения; конструктив и размеры уточняются в рабочем проекте.')}</p></section>` : '';
  return withMetrica(`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#244b3b"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${projectUrl(project)}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="ЭФТ"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${projectUrl(project)}"><meta property="og:image" content="${imageUrl}"><link rel="icon" href="/icons/eft-logo.png"><link rel="stylesheet" href="/project-page.css?v=graphite-continuous"></head><body><header><a href="/" aria-label="ЭФТ — на главную"><img src="/site-assets/eft-logo-dark.png" alt="ЭФТ"></a><a class="header-contact" href="tel:+74957459911">+7 (495) 745-99-11</a></header><main><nav class="breadcrumbs" aria-label="Навигация"><a href="/">Главная</a><span>›</span><a href="/#${escapeHtml(project.categoryId)}">${escapeHtml(project.category)}</a><span>›</span><span aria-current="page">${escapeHtml(project.name)}</span></nav><article><div class="project-hero"><div><span class="eyebrow">${escapeHtml(project.category)}</span><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(summary)}</p><div class="facts">${facts}</div><div class="actions"><a class="button primary" href="/?project=${encodeURIComponent(project.id)}#contact">Обсудить проект</a><a class="button secondary" href="/EFT_client_questionnaire.html">Заполнить анкету</a></div></div><div style="view-transition-name:photo-${escapeHtml(project.id)}">${project.id === 'lotos' ? lotosFinishPreview() : `<img src="/site-assets/${encodeURIComponent(project.image)}" alt="Проект ${escapeHtml(project.name)} — фасад">`}</div></div><div class="content-grid"><div>${planSection}${rooms ? `<section><h2>Помещения</h2><ul>${rooms}</ul></section>` : ''}</div><div>${priceSection}${highlights ? `<section><h2>Особенности проекта</h2><ul>${highlights}</ul></section>` : ''}${project.included ? `<section><h2>Что входит</h2><p>${escapeHtml(project.included)}</p></section>` : ''}</div></div></article></main><footer>ЭФТ · Московская и Калужская области · <a href="/">Все проекты</a></footer></body></html>`);
}
const server = await createServer({
  configFile: resolve(root, 'vite.public.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { default: Site } = await server.ssrLoadModule('/src/site/Site.jsx');
  const { houses } = await server.ssrLoadModule('/src/site/data.js');
  const markup = renderToString(createElement(Site));
  const indexPath = resolve(output, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  if (!index.includes('<div id="root"></div>') || !markup.includes('<h1')) {
    throw new Error('Public site prerendering did not produce the expected page');
  }
  await writeFile(indexPath, withMetrica(index.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)));
  const questionnairePath = resolve(output, 'EFT_client_questionnaire.html');
  await writeFile(questionnairePath, withMetrica(await readFile(questionnairePath, 'utf8')));
  await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://eftsip.ru/sitemap.xml\n');
  await writeFile(resolve(output, 'yandex_614408f82b2407b4.html'), '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body>Verification: 614408f82b2407b4</body></html>');
  const ids = new Set();
  await mkdir(resolve(output, 'projects'), { recursive: true });
  await writeFile(resolve(output, 'project-page.css'), await readFile(resolve(root, 'src/site/project-page.css')));
  for (const project of houses) {
    if (!/^[a-z0-9-]+$/.test(project.id) || ids.has(project.id)) {
      throw new Error(`Invalid or duplicate project ID: ${project.id}`);
    }
    ids.add(project.id);
    await writeFile(resolve(output, 'projects', `${project.id}.html`), renderProjectPage(project));
  }
  const urls = [siteOrigin + '/', `${siteOrigin}/EFT_client_questionnaire.html`, ...houses.map(projectUrl)];
  await writeFile(resolve(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`);
} finally {
  await server.close();
}
