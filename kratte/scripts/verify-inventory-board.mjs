import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const workspace = async () => {
  const response = await context.request.get('/api/workspace');
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
const patch = async (resource, id, data) => {
  const response = await context.request.patch(`/api/records/${resource}/${id}`, { data, headers: { 'Idempotency-Key': randomUUID() } });
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).record;
};
try {
  await page.goto('/inventory', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Board view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  await page.locator('.pin-photo.photo-ready').first().waitFor();
  const masonry = await page.locator('.inventory-pin').evaluateAll(cards => cards.map(card => { const rect = card.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, x: rect.x, width: rect.width }; }));
  assert.equal(new Set(masonry.slice(0, 4).map(card => Math.round(card.x))).size, 4);
  assert.ok(new Set(masonry.slice(0, 4).map(card => Math.round(card.bottom))).size > 2, 'Cards have varied heights');
  for (let a = 0; a < masonry.length; a++) for (let b = a + 1; b < masonry.length; b++) {
    const first = masonry[a], second = masonry[b];
    if (Math.abs(first.x - second.x) < 1) assert.ok(first.bottom <= second.top || second.bottom <= first.top, 'Cards cannot overlap');
  }
  checks.push('Inventory defaults to a real four-column masonry board with no overlapping cards');

  const initial = await workspace();
  const coffee = initial.records.inventory.find(product => product.name === 'Arabica Coffee Beans');
  assert.ok(coffee);
  const card = page.locator(`[data-product-id="${coffee.id}"]`);
  await card.getByRole('button', { name: `Save ${coffee.name}`, exact: true }).click();
  await expect(card.getByRole('button', { name: `Unsave ${coffee.name}`, exact: true })).toBeEnabled();
  assert.equal((await workspace()).records.inventory.find(p => p.id === coffee.id).pinned, true);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /Saved/ }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(1);
  await expect(page.getByText(coffee.name, { exact: true })).toBeVisible();
  checks.push('Bookmarks persist across reloads and appear in the saved-products collection');

  await page.getByRole('tab', { name: /All products/ }).click();
  await page.getByRole('combobox', { name: 'Product category', exact: true }).selectOption('Beverages');
  await expect(page.locator('.inventory-pin')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Product category', exact: true }).selectOption('All categories');
  await page.getByRole('textbox', { name: 'Search Inventory' }).fill('no-such-product-qa');
  await expect(page.getByText('Nothing in this little corner. Yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explore all products' }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort inventory' }).selectOption('price-high');
  assert.equal(await page.locator('.inventory-pin').first().getAttribute('data-product-id'), initial.records.inventory.reduce((a, b) => a.price > b.price ? a : b).id);
  await page.getByRole('combobox', { name: 'Sort inventory' }).selectOption('store');
  await page.getByLabel('Min. price', { exact: true }).fill('15');
  const expensiveCards = await page.locator('.inventory-pin').count();
  assert.equal(expensiveCards, initial.records.inventory.filter(p => p.price >= 15).length);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  checks.push('Category chips, search empty states, price filters, and sorting work together');

  await card.hover();
  await card.getByRole('button', { name: `Quick edit ${coffee.name}`, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input[name=price]').fill('19.75');
  await dialog.locator('input[name=stock]').fill('260');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let state = await workspace();
  let updatedCoffee = state.records.inventory.find(p => p.id === coffee.id);
  assert.equal(updatedCoffee.stock, 260); assert.equal(updatedCoffee.price, 19.75); assert.equal(updatedCoffee.pinned, true);
  checks.push('Quick edit saves price and stock immediately without losing saved status');

  await card.hover();
  await card.getByRole('button', { name: `Quick edit ${coffee.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await patch('inventory', coffee.id, { name: coffee.name, stock: 265 });
  await dialog.locator('input[name=price]').fill('20.25');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await workspace()).records.inventory.find(p => p.id === coffee.id).stock, 265);
  await card.hover();
  await card.getByRole('button', { name: `Quick edit ${coffee.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await patch('inventory', coffee.id, { name: coffee.name, stock: 266 });
  await dialog.locator('input[name=stock]').fill('270');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.locator('.form-error')).toContainText('Stock changed');
  assert.equal((await workspace()).records.inventory.find(p => p.id === coffee.id).stock, 266);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Price-only edits preserve concurrent stock changes; stale stock counts are rejected');

  await card.hover();
  await card.getByRole('button', { name: `Sell ${coffee.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('spinbutton', { name: `${coffee.name} quantity`, exact: true })).toHaveValue('1');
  await expect(dialog.locator('.order-total strong')).toHaveText('$20.25');
  await dialog.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await workspace()).records.inventory.find(p => p.id === coffee.id).stock, 265);
  checks.push('Sell from a card opens a correctly priced one-item sale and updates stock');

  await page.getByRole('tab', { name: /Needs attention/ }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(4);
  const coconut = (await workspace()).records.inventory.find(p => p.name === 'Organic Coconut Oil');
  const coconutCard = page.locator(`[data-product-id="${coconut.id}"]`);
  await coconutCard.getByRole('button', { name: `Restock ${coconut.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('select[name=supplier]')).toHaveValue(coconut.supplier);
  await expect(dialog.getByRole('spinbutton', { name: `${coconut.name} quantity`, exact: true })).toHaveValue('24');
  await dialog.getByRole('button', { name: 'Create purchase order', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(coconutCard.getByRole('button', { name: `View incoming order for ${coconut.name}`, exact: true })).toBeVisible();
  await coconutCard.getByRole('button', { name: `View incoming order for ${coconut.name}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit purchase order', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('select[name=status]').selectOption('Received');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.inventory-pin')).toHaveCount(3);
  assert.equal((await workspace()).records.inventory.find(p => p.id === coconut.id).stock, 24);
  checks.push('Attention cards create restock orders, show incoming deliveries, and clear after receiving stock');

  await page.getByRole('tab', { name: /All products/ }).click();
  await page.getByRole('button', { name: 'More inventory actions' }).click();
  await page.getByRole('menuitem', { name: 'Select products', exact: true }).click();
  await card.getByRole('checkbox', { name: `Select ${coffee.name}`, exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.inventory-selection-bar').getByRole('button', { name: 'Export', exact: true }).click();
  assert.match((await downloadPromise).suggestedFilename(), /^shopwise-inventory-.*\.csv$/);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  checks.push('Board selection and CSV export work without leaving the visual view');

  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.locator('.inventory-table')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Board view', exact: true })).toBeEnabled();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.inventory-table')).toBeVisible();
  await page.getByRole('button', { name: 'Board view', exact: true }).click();
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  await page.getByRole('button', { name: 'More inventory actions' }).click();
  await page.getByRole('menuitem', { name: 'Switch to compact cards', exact: true }).click();
  await expect(page.locator('.inventory-masonry')).toHaveClass(/is-compact/);
  await expect.poll(async () => (await workspace()).user.settings.inventoryDensity).toBe('compact');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.inventory-masonry')).toHaveClass(/is-compact/);
  await page.getByRole('button', { name: 'More inventory actions' }).click();
  await page.getByRole('menuitem', { name: 'Switch to comfortable cards', exact: true }).click();
  checks.push('Board/table and comfortable/compact layout preferences persist across reloads');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.inventory-pin')).toHaveCount(12);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const mobileColumns = await page.locator('.inventory-masonry').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(mobileColumns, 2);
  await card.getByRole('button', { name: `Update stock for ${coffee.name}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Mobile has a quiet two-column board with working stock shortcuts and product menus');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks, browserErrors: errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', completed: checks, url: page.url(), browserErrors: errors }, null, 2));
  throw error;
} finally { await browser.close(); }
