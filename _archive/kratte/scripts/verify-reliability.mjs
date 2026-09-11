import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const previewURL = process.env.PREVIEW_URL;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ baseURL, viewport: { width: 1365, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const passed = [];
const suffix = Date.now().toString();
const read = async path => {
  const response = await context.request.get(path);
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
const workspace = () => read('/api/workspace');
const fillExpense = async (name, amount = '12') => {
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name=name]').fill(name);
  await dialog.locator('input[name=amount]').fill(amount);
  await expect(dialog.locator('input[name=name]')).toHaveValue(name);
  await expect(dialog.locator('input[name=amount]')).toHaveValue(amount);
  return dialog;
};
try {
  await page.goto('/expenses', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible();
  const savedName = `Confirmed save ${suffix}`;
  let dialog = await fillExpense(savedName);
  await page.route('**/api/workspace', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary sync interruption' }) })
    : route.continue());
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.sync-notice')).toBeVisible();
  assert.equal((await read('/api/records/expenses')).filter(row => row.name === savedName).length, 1);
  await page.unroute('**/api/workspace');
  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  passed.push('A confirmed save closes normally even when its follow-up refresh fails');

  const initial = await workspace();
  const product = initial.records.inventory.find(p => p.stock > 50);
  assert.ok(product);
  const stockBefore = product.stock;
  const orderCount = initial.records.sales.length;
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New sale/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Choose a product' }).selectOption(product.id);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: `${product.name} quantity` }).fill('3');
  await dialog.locator('input[name=notes]').fill(`Interrupted sale ${suffix}`);
  const retryKeys = [];
  let dropped = false;
  let savedSale;
  await page.route('**/api/records/sales', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    retryKeys.push(route.request().headers()['idempotency-key']);
    if (dropped) return route.continue();
    dropped = true;
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    savedSale = (await response.json()).record;
    await route.abort('failed');
  });
  await dialog.getByRole('button', { name: 'Complete sale' }).click();
  await expect(dialog.locator('.form-error')).toBeVisible();
  await expect(dialog.locator('input[name=notes]')).toHaveValue(`Interrupted sale ${suffix}`);
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, stockBefore - 3);
  await dialog.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/api/records/sales');
  const afterRetry = await workspace();
  assert.equal(afterRetry.records.sales.length, orderCount + 1);
  assert.equal(afterRetry.records.sales.filter(s => s.id === savedSale.id).length, 1);
  assert.equal(afterRetry.records.inventory.find(p => p.id === product.id).stock, stockBefore - 3);
  assert.equal(retryKeys.length, 2); assert.ok(retryKeys[0]); assert.equal(retryKeys[0], retryKeys[1]);
  passed.push('A lost checkout response can be retried without duplicate orders or double stock deductions');

  const editKey = randomUUID();
  const edit = { ...savedSale, items: savedSale.items.map(i => ({ ...i, quantity: 5 })) };
  const editResponses = await Promise.all([1, 2].map(() => context.request.patch(`/api/records/sales/${savedSale.id}`, { headers: { 'Idempotency-Key': editKey }, data: edit })));
  for (const response of editResponses) assert.equal(response.status(), 200, await response.text());
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, stockBefore - 5);
  const conflict = await context.request.patch(`/api/records/sales/${savedSale.id}`, { headers: { 'Idempotency-Key': editKey }, data: { ...edit, status: 'Cancelled' } });
  assert.equal(conflict.status(), 409);
  const deleteKey = randomUUID();
  for (let i = 0; i < 2; i++) {
    const response = await context.request.delete(`/api/records/sales/${savedSale.id}`, { headers: { 'Idempotency-Key': deleteKey } });
    assert.equal(response.status(), 200, await response.text());
  }
  assert.equal((await workspace()).records.inventory.find(p => p.id === product.id).stock, stockBefore);
  passed.push('Concurrent edit retries and repeated deletes run once; conflicting retry payloads are rejected');

  await page.goto('/expenses', { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Search Expenses' }).fill(savedName);
  await page.getByText(savedName, { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.route('**/api/workspace', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary sync interruption' }) })
    : route.continue());
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(savedName, { exact: true })).toHaveCount(0);
  assert.ok(!(await read('/api/records/expenses')).some(row => row.name === savedName));
  await page.unroute('**/api/workspace');
  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  passed.push('A failed refresh cannot resurrect a successfully deleted record');

  await page.getByRole('textbox', { name: 'Search Expenses' }).fill('');
  const offlineName = `Offline draft ${suffix}`;
  dialog = await fillExpense(offlineName);
  await context.setOffline(true);
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(dialog.locator('.form-error')).toContainText(/offline/i);
  await expect(dialog.locator('input[name=name]')).toHaveValue(offlineName);
  await context.setOffline(false);
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await read('/api/records/expenses')).filter(row => row.name === offlineName).length, 1);
  passed.push('Offline attempts preserve the form and recover without phantom records');

  const email = `reliability-${suffix}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const registered = await context.request.post('/api/auth', { data: { action: 'register', email, password, name: 'Reliability Test', storeName: 'Reliable Store' } });
  assert.equal(registered.status(), 201, await registered.text());
  const owner = (await registered.json()).user;
  await page.reload({ waitUntil: 'networkidle' });
  dialog = await fillExpense(`Session draft ${suffix}`);
  const cookie = (await context.cookies()).find(c => c.name === 'shopwise_session_v2');
  assert.ok(cookie);
  await context.addCookies([{ ...cookie, value: 'invalid-session-for-regression' }]);
  const expired = await context.request.get('/api/workspace');
  assert.equal(expired.status(), 401);
  assert.equal((await expired.json()).code, 'SESSION_EXPIRED');
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  const recovery = page.locator('.session-recovery');
  await expect(recovery).toBeVisible();
  await expect(recovery.locator('input[name=email]')).toHaveValue(email);
  await page.keyboard.press('Tab');
  assert.equal(await recovery.evaluate(el => el.contains(document.activeElement)), true);
  await recovery.locator('input[name=password]').fill(password);
  await recovery.getByRole('button', { name: 'Sign in & continue' }).click();
  await expect(recovery).toHaveCount(0);
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[name=name]')).toHaveValue(`Session draft ${suffix}`);
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await workspace()).user.id, owner.id);
  passed.push('Expired sessions no longer replace workspaces, and reauthentication preserves the open draft');

  const wrongWorkspace = await context.request.post('/api/records/expenses', { headers: { 'X-Shopwise-Workspace': randomUUID() }, data: { name: 'Wrong account write', amount: 10, category: 'Other', status: 'Paid', date: new Date().toISOString().slice(0, 10) } });
  assert.equal(wrongWorkspace.status(), 409);
  passed.push('Stale tabs cannot accidentally write into a different active account');

  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await expect(page.locator('.sync-notice')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await context.setOffline(false);
  passed.push('Recovery notices remain usable without horizontal overflow on mobile');

  if (previewURL) {
    const embeddedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const embedded = await embeddedContext.newPage();
    embedded.on('pageerror', error => errors.push(error.message));
    await embedded.route('https://shopwise-embed.test/', route => route.fulfill({ contentType: 'text/html', body: `<iframe src="${previewURL}" style="border:0;width:1365px;height:900px"></iframe>` }));
    await embedded.goto('https://shopwise-embed.test/', { waitUntil: 'networkidle' });
    const frame = embedded.frames().find(f => f.url().startsWith(previewURL));
    assert.ok(frame);
    await expect(frame.locator('.stat-card')).toHaveCount(4);
    const session = await frame.evaluate(async () => (await (await fetch('/api/auth')).json()).user);
    assert.ok(session, 'Embedded session cookie must be retained');
    await frame.getByRole('link', { name: 'Expenses', exact: true }).click();
    await frame.getByRole('button', { name: 'Add expense', exact: true }).click();
    const embeddedDialog = frame.getByRole('dialog');
    await embeddedDialog.locator('input[name=name]').fill(`Embedded expense ${suffix}`);
    await embeddedDialog.locator('input[name=amount]').fill('24');
    await embeddedDialog.getByRole('button', { name: 'Add expense', exact: true }).click();
    await expect(frame.getByRole('dialog')).toHaveCount(0);
    await frame.goto(`${previewURL}/login?mode=register`, { waitUntil: 'networkidle' });
    const embeddedEmail = `embedded-${suffix}@example.com`;
    await frame.locator('input[name=name]').fill('Embedded Test');
    await frame.locator('input[name=storeName]').fill('Embedded Store');
    await frame.locator('input[name=email]').fill(embeddedEmail);
    await frame.locator('input[name=password]').fill(password);
    await frame.getByRole('button', { name: 'Create your workspace' }).click();
    await expect(frame.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await frame.locator('.profile-button').click();
    await frame.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Sign in to your workspace' })).toBeVisible();
    await frame.locator('input[name=email]').fill(embeddedEmail);
    await frame.locator('input[name=password]').fill(password);
    await frame.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(frame.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    const restored = await frame.evaluate(async () => (await (await fetch('/api/auth')).json()).user);
    assert.equal(restored.id, session.id);
    passed.push('Cross-site embedded preview supports persistent sessions, saves, registration, logout, and sign-in');
    await embeddedContext.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks: passed, embeddedTest: previewURL ? 'passed' : 'Set PREVIEW_URL to include the cross-site iframe check.', browserErrors: errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', passed, url: page.url(), browserErrors: errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
