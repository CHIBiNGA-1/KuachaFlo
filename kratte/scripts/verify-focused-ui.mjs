import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const failures = [];
const checks = [];
page.on('pageerror', error => failures.push(error.message));
try {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.calm-metrics .stat-card')).toHaveCount(4);
  await expect(page.locator('.calm-extra-insights')).toHaveCount(0);
  await expect(page.locator('.upgrade-card')).toHaveCount(0);
  await expect(page.locator('.nav-new')).toHaveCount(0);
  await expect(page.locator('.calm-review-list button')).toHaveCount(3);
  assert.equal(await page.locator('.sidebar-navigation a').count(), 10);
  checks.push('Calm dashboard defaults: four clear metrics, a single chart, no promotion, and all navigation links retained');

  await page.getByRole('button', { name: /More insights/ }).click();
  await expect(page.getByRole('heading', { name: 'Sales by channel', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top-selling products', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Channel measure' }).selectOption('Orders');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.calm-extra-insights')).toBeVisible();
  await page.getByRole('button', { name: /Less detail/ }).click();
  await expect(page.locator('.calm-extra-insights')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.calm-extra-insights')).toHaveCount(0);
  checks.push('Extra analytics remain available on demand and disclosure preferences persist');

  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  await expect(page.locator('.calm-inventory-summary')).toHaveCount(0);
  await expect(page.locator('.inventory-add-tile')).toHaveCount(0);
  await expect(page.locator('.pin-feature-badge')).toHaveCount(0);
  const top = await page.locator('.inventory-masonry').evaluate(element => element.getBoundingClientRect().top);
  assert.ok(top < 370, `Products should be visible without a stack of summary cards; board starts at ${top}`);
  const more = page.getByRole('button', { name: 'More inventory actions' });
  await more.focus();
  await more.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Select products', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Show stock overview' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.calm-inventory-summary')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.calm-inventory-summary')).toBeVisible();
  await more.click();
  await page.getByRole('menuitem', { name: 'Hide stock overview' }).click();
  await expect(page.locator('.calm-inventory-summary')).toHaveCount(0);
  await more.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'More inventory actions' })).toHaveCount(0);
  await expect(more).toBeFocused();
  checks.push('Compact inventory toolbar, persistent stock overview, and keyboard-complete action menu');

  const tabs = page.getByRole('tablist', { name: 'Inventory collections' });
  await tabs.getByRole('tab', { name: 'All products', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.inventory-pin')).toHaveCount(4);
  await expect(page.locator('.pin-followup')).toHaveCount(4);
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Saved', exact: true })).toHaveAttribute('aria-selected', 'true');
  checks.push('Inventory tabs support keyboard navigation and surface restocking only in the focused review view');

  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await expect(page.locator('.resource-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show summary' }).click();
  await expect(page.locator('.resource-summary')).toBeVisible();
  await page.getByRole('button', { name: 'Hide summary' }).click();
  await expect(page.locator('.resource-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New expense' })).toBeVisible();
  await page.keyboard.press('Escape');
  checks.push('Resource summaries are optional; primary CRUD actions stay one click away');

  const invalid = await context.request.patch('/api/workspace', { data: { settings: { showDashboardInsights: 'true' } } });
  assert.equal(invalid.status(), 400);
  const missingSession = await browser.newContext({ baseURL });
  const unauthenticated = await missingSession.request.patch('/api/workspace', { data: { settings: { showDashboardInsights: true } } });
  assert.equal(unauthenticated.status(), 401);
  await missingSession.close();
  checks.push('Display preferences are validated and require an authenticated workspace');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.stat-card')).toHaveCount(4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'More inventory actions' }).click();
  await page.getByRole('menuitem', { name: 'Select products', exact: true }).click();
  await expect(page.locator('.inventory-selection-bar')).toBeVisible();
  checks.push('Focused navigation and hidden actions remain usable on mobile without horizontal overflow');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ status: 'PASS', checks, browserErrors: failures }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', passed: checks, url: page.url(), browserErrors: failures }, null, 2));
  throw error;
} finally { await browser.close(); }
