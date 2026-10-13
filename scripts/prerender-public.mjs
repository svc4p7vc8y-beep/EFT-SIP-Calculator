import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist-public');
const server = await createServer({
  configFile: resolve(root, 'vite.public.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { default: Site } = await server.ssrLoadModule('/src/site/Site.jsx');
  const markup = renderToString(createElement(Site));
  const indexPath = resolve(output, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  if (!index.includes('<div id="root"></div>') || !markup.includes('<h1')) {
    throw new Error('Public site prerendering did not produce the expected page');
  }
  await writeFile(indexPath, index.replace('<div id="root"></div>', `<div id="root">${markup}</div>`));
  await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://eftsip.ru/sitemap.xml\n');
  await writeFile(resolve(output, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://eftsip.ru/</loc></url>\n  <url><loc>https://eftsip.ru/EFT_client_questionnaire.html</loc></url>\n</urlset>\n');
} finally {
  await server.close();
}
