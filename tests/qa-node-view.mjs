import { chromium } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = await chromium.launch({ headless: true });
for (const width of [1280, 768, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 850 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/react.html', { waitUntil: 'networkidle' });
  const nav = page.getByText('Метизы по узлам', { exact: true });
  if (width < 1100) await page.getByRole('button', { name: 'Открыть меню' }).click();
  await nav.click();
  await page.getByRole('heading', { name: 'Карточка узла' }).waitFor();
  await page.locator('.node-3d-canvas canvas').waitFor();
  const three = await page.locator('.node-3d-canvas canvas').count();
  for (const label of ['Пол', 'Потолок', 'Кровля']) {
    const button = page.locator('.node-3d-layers button', { hasText: label });
    await button.click();
    if (await button.getAttribute('aria-pressed') !== 'true') throw new Error(`${label} layer did not activate`);
    if (label === 'Кровля') {
      const lath = page.getByRole('button', { name: 'Обрешётка скрыта' });
      await lath.click();
      if (await page.getByRole('button', { name: 'Обрешётка видна' }).getAttribute('aria-pressed') !== 'true') throw new Error('Roof lath toggle did not activate');
      await page.getByRole('button', { name: 'Обрешётка видна' }).click();
    }
    if (width !== 768) {
      await page.locator('.node-3d-canvas').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(tmpdir(), `eft-nodes-${label}-${width}.png`), fullPage: false });
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.getByRole('button', { name: '2D-план' }).click();
  if (!await page.locator('svg.node-map').count()) throw new Error('2D reserve view is unavailable');
  await page.getByRole('button', { name: '3D-дом' }).click();
  await page.locator('.node-3d-canvas canvas').waitFor();
  await page.getByRole('button', { name: 'Проверить' }).first().click();
  await page.locator('.node-detail-card:focus').waitFor();
  const focusedCard = await page.evaluate(() => document.activeElement?.classList.contains('node-detail-card'));
  if (!focusedCard) throw new Error('Проверить did not focus the node card');
  await page.getByLabel('Название узла').fill('Проверка редактирования');
  if (!await page.getByText('Проверка редактирования', { exact: true }).count()) throw new Error('Node card edit did not update');
  await page.screenshot({ path: join(tmpdir(), `eft-nodes-${width}.png`), fullPage: false });
  console.log(JSON.stringify({ width, three, overflow, focusedCard, errors, screenshot: join(tmpdir(), `eft-nodes-${width}.png`) }));
  await page.close();
}
await browser.close();
