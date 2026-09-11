import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /content security policy|Refused to execute/i.test(message.text())) errors.push(message.text()); });
const suffix = Date.now().toString();
const productName = `Test Roasted Coffee ${suffix}`;
const date = new Date().toISOString().slice(0, 10);
const checked = [];
const request = async (method, path, data, expected = 200) => {
  const response = await context.request.fetch(path, { method, data });
  const body = await response.json();
  assert.equal(response.status(), expected, `${method} ${path}: ${JSON.stringify(body)}`);
  return body;
};
const workspace = () => request('GET', '/api/workspace');
try {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.stat-card')).toHaveCount(4);
  const initial = await workspace();
  assert.equal(initial.records.sales.length, 240);
  checked.push('Seeded dashboard, session persistence, live analytics');

  await page.getByRole('link', { name: /^Inventory/ }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input[name=name]').fill(productName);
  await dialog.locator('input[name=sku]').fill(`TEST-${suffix}`);
  await dialog.locator('input[name=price]').fill('17.50');
  await dialog.locator('input[name=cost]').fill('8.25');
  await dialog.locator('input[name=stock]').fill('10');
  await dialog.locator('input[name=reorderAt]').fill('3');
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search Inventory' }).fill(productName);
  await page.getByText(productName, { exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit product' }).click();
  await dialog.locator('input[name=stock]').fill('12');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  let state = await workspace();
  const product = state.records.inventory.find(p => p.name === productName);
  assert.ok(product); assert.equal(product.stock, 12);
  await page.reload({ waitUntil: 'networkidle' });
  state = await workspace(); assert.equal(state.records.inventory.find(p => p.id === product.id).stock, 12);
  checked.push('Product create/read/update and persistence after reload');

  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search your workspace' }).fill(productName);
  await page.getByRole('textbox', { name: 'Search your workspace' }).press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading', { name: productName })).toBeVisible();
  await page.keyboard.press('Escape');
  checked.push('Keyboard-driven global search and accessible dialogs');

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New sale/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Choose a product' }).selectOption(product.id);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: `${productName} quantity` }).fill('3');
  await dialog.getByRole('button', { name: 'Complete sale' }).click();
  await expect(dialog).toHaveCount(0);
  state = await workspace();
  assert.equal(state.records.inventory.find(p => p.id === product.id).stock, 9);
  const sale = state.records.sales.find(s => s.items?.some(i => i.productId === product.id));
  assert.ok(sale); assert.equal(sale.amount, 52.5);
  checked.push('End-to-end checkout with authoritative totals and automatic stock deduction');

  await request('POST', '/api/records/sales', { name: '', customer: 'Walk-in customer', status: 'Completed', payment: 'Paid', channel: 'Retail', date, items: [{ productId: product.id, quantity: 999 }] }, 400);
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 9);
  await request('PATCH', `/api/records/sales/${sale.id}`, { ...sale, status: 'Cancelled' });
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 12);
  await request('PATCH', `/api/records/sales/${sale.id}`, { ...sale, status: 'Completed' });
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 9);
  await request('DELETE', `/api/records/sales/${sale.id}`);
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 12);
  checked.push('Overselling prevention, cancelled-sale restoration, and delete reversals');

  const purchase = (await request('POST', '/api/records/purchases', { supplier: 'Harvest & Co.', status: 'Received', payment: 'Paid', date, items: [{ productId: product.id, quantity: 10 }] }, 201)).record;
  assert.equal(purchase.amount, 82.5);
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 22);
  await request('PATCH', `/api/records/purchases/${purchase.id}`, { ...purchase, status: 'Ordered' });
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 12);
  await request('DELETE', `/api/records/purchases/${purchase.id}`);
  checked.push('Purchase receiving, cost-based totals, and stock reversal');

  for (const [resource, values] of [
    ['customers', { name: `Customer ${suffix}`, company: 'Test Market', email: `customer-${suffix}@example.com`, channel: 'Wholesale', balance: 0 }],
    ['suppliers', { name: `Supplier ${suffix}`, company: 'Test Contact', email: `supplier-${suffix}@example.com`, status: 'Active', category: 'Pantry' }],
    ['expenses', { name: `Expense ${suffix}`, amount: 29.9, category: 'Supplies', date, payment: 'Cash', status: 'Paid' }],
    ['team', { name: `Member ${suffix}`, email: `member-${suffix}@example.com`, role: 'Manager', status: 'Active' }],
  ]) {
    const item = (await request('POST', `/api/records/${resource}`, values, 201)).record;
    assert.ok(item.id);
    const updated = (await request('PATCH', `/api/records/${resource}/${item.id}`, { ...item, notes: 'Verified persistent edit.' })).record;
    assert.equal(updated.notes, 'Verified persistent edit.');
    assert.ok((await request('GET', `/api/records/${resource}`)).some(r => r.id === item.id));
    await request('DELETE', `/api/records/${resource}/${item.id}`);
  }
  checked.push('Customers, suppliers, expenses, and team: complete CRUD');

  const other = await browser.newContext({ baseURL });
  const unauthenticated = await other.request.post('/api/records/inventory', { data: product });
  assert.equal(unauthenticated.status(), 401);
  const otherState = await (await other.request.get('/api/workspace')).json();
  assert.notEqual(otherState.user.id, initial.user.id);
  const crossTenant = await other.request.patch(`/api/records/inventory/${product.id}`, { data: { ...product, stock: 1000 } });
  assert.equal(crossTenant.status(), 400);
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, 12);
  await other.close();
  checked.push('Unauthenticated request rejection and cross-workspace data isolation');

  await page.goto('/inventory', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More inventory actions' }).click();
  await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
  const download = await downloadPromise; assert.match(download.suggestedFilename(), /^shopwise-inventory-.*\.csv$/);
  await page.getByRole('textbox', { name: 'Search Inventory' }).fill(productName);
  await page.getByText(productName, { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.ok(!(await workspace()).records.inventory.some(p => p.id === product.id));
  checked.push('CSV downloads and confirmed product deletion');

  await request('PATCH', '/api/workspace', { settings: { currency: 'EUR', weeklyDigest: false } });
  state = await workspace(); assert.equal(state.user.settings.currency, 'EUR'); assert.equal(state.user.settings.weeklyDigest, false);
  await request('PATCH', '/api/workspace', { settings: { currency: 'USD' }, action: 'start-trial' });
  state = await workspace(); assert.equal(state.user.settings.plan, 'Pro trial'); assert.ok(state.user.settings.trialEnds);
  checked.push('Persistent currency/preferences and no-charge Pro trial');

  const email = `qa-${suffix}@example.com`; const password = randomBytes(18).toString('base64url');
  await page.goto('/login?mode=register', { waitUntil: 'networkidle' });
  await page.locator('input[name=name]').fill('Jordan Test');
  await page.locator('input[name=storeName]').fill('Integration Test Store');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  state = await workspace(); assert.equal(state.user.id, initial.user.id); assert.equal(state.user.isDemo, false); assert.equal(state.user.storeName, 'Integration Test Store');
  await request('POST', '/api/auth', { action: 'logout' });
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  assert.equal((await workspace()).user.id, initial.user.id);
  checked.push('Registration preserving demo data, secure logout, and password sign-in');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  checked.push('Mobile navigation, overflow-free tables, and mobile dialogs');

  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(JSON.stringify({ status: 'PASS', checks: checked, browserErrors: errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'artifacts/test-failure.png', fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ status: 'FAIL', passed: checked, currentUrl: page.url(), browserErrors: errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
