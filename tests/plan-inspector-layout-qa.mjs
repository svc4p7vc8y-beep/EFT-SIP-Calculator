import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EFT_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.EFT_QA_URL || 'http://127.0.0.1:5187/react.html');
  await page.getByText('Параметры дома', { exact: true }).waitFor();
  await page.getByText('Доски / несущие', { exact: true }).click();
  await expect(page.locator('#parameter-partitions')).toHaveAttribute('open', '');
  await expect(page.getByRole('group', { name: 'Доски и несущие стены' })).toBeVisible();
  await expect(page.locator('.planner-canvas > .bearing-selection-controls')).toHaveCount(0);
  await expect(page.getByText('Расчётные нормы, связи и наценки', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Раздел параметров', { exact: true })).toHaveCount(0);

  const roof = page.locator('#parameter-roof');
  await roof.locator('summary').click();
  await expect(roof.getByText('Добавить прогон / ферму на план', { exact: true })).toBeVisible();
  const production = page.locator('#parameter-production');
  await production.locator('summary').click();
  await expect(production.getByText('План и раскладка', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tmp/plan-inspector-1600.png', fullPage: false });

  for (const viewport of [{ width: 1024, height: 900 }, { width: 430, height: 850 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) throw new Error(`Horizontal overflow ${overflow}px at ${viewport.width}px`);
    await page.screenshot({ path: `tmp/plan-inspector-${viewport.width}.png`, fullPage: false });
  }
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
  console.log('Plan inspector UI verified at 1600, 1024 and 430 px.');
} finally {
  await browser.close();
}
