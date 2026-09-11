import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
let cookies = new Map();
const checks = [];
async function call(path, { method = 'GET', data, headers = {}, raw, cookieJar = cookies } = {}) {
  const response = await fetch(new URL(path, base), { method, headers: { Cookie: [...cookieJar].map(([key, value]) => `${key}=${value}`).join('; '), ...(data !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw !== undefined ? raw : data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(25000) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const index = pair.indexOf('='); const key = pair.slice(0, index); const value = pair.slice(index + 1); if (value) cookieJar.set(key, value); else cookieJar.delete(key); }
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { response, body };
}
async function ok(path, options, status = 200) {
  const result = await call(path, options);
  assert.equal(result.response.status, status, `${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}
try {
  await ok('/api/live'); await ok('/api/health');
  const page = await fetch(base + '/inventory');
  assert.equal(page.status, 200);
  const csp = page.headers.get('Content-Security-Policy');
  assert.match(csp, /script-src.*nonce-/); assert.match(csp, /object-src 'none'/); assert.doesNotMatch(csp.split(';').find(item => item.includes('script-src')), /unsafe-inline|unsafe-eval/);
  assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff'); assert.ok(page.headers.get('X-Request-ID')); assert.equal(page.headers.get('X-Powered-By'), null);
  checks.push('Readiness/liveness, request IDs, and enforced nonce-based CSP');

  const state = await ok('/api/workspace'); const owner = state.user.id;
  for (const [body, type, expected] of [['{broken', 'application/json', 400], ['[]', 'application/json', 400], ['{}', 'text/plain', 415], [JSON.stringify({ name: 'x'.repeat(140000) }), 'application/json', 413], ['{"__proto__":{"polluted":true}}', 'application/json', 400]]) {
    const result = await call('/api/records/inventory', { method: 'POST', raw: body, headers: { 'Content-Type': type } });
    assert.equal(result.response.status, expected); assert.ok(result.body.requestId); assert.match(result.response.headers.get('Cache-Control'), /no-store/);
  }
  const forged = await call('/api/records/inventory', { method: 'POST', data: {}, headers: { Origin: 'https://evil.example' } }); assert.equal(forged.response.status, 403);
  const crossSite = await call('/api/records/inventory', { method: 'POST', data: {}, headers: { 'Sec-Fetch-Site': 'cross-site' } }); assert.equal(crossSite.response.status, 403);
  checks.push('Malformed/oversized payloads, prototype keys, non-JSON bodies, and forged origins are rejected');

  const products = state.records.inventory;
  let cursor = null; const ids = [];
  do { const page = await ok('/api/records/inventory?limit=3' + (cursor ? `&cursor=${cursor}` : '')); ids.push(...page.records.map(row => row.id)); cursor = page.nextCursor; } while (cursor);
  assert.equal(new Set(ids).size, products.length); assert.equal(ids.length, products.length);
  checks.push('Keyset pagination returns each owned record exactly once');

  const stamp = Date.now();
  const product = (await ok('/api/records/inventory', { method: 'POST', data: { name: 'Production test item', sku: `PROD-${stamp}`, category: 'Other', stock: 10, reorderAt: 1, price: 0.1, cost: 0.03 } }, 201)).record;
  assert.equal(product.version, 1);
  const changed = await call(`/api/records/inventory/${product.id}`, { method: 'PATCH', headers: { 'If-Match': '"1"' }, data: { name: product.name, stock: 12 } });
  assert.equal(changed.response.status, 200); assert.equal(changed.body.record.version, 2);
  const conflict = await call(`/api/records/inventory/${product.id}`, { method: 'PATCH', headers: { 'If-Match': '"1"' }, data: { name: product.name, stock: 99 } });
  assert.equal(conflict.response.status, 409); assert.equal(conflict.body.code, 'VERSION_CONFLICT');
  checks.push('Optimistic concurrency rejects stale versions without overwriting stock');

  const key = randomUUID();
  const saleInput = { status: 'Completed', date: new Date().toISOString().slice(0, 10), payment: 'Paid', channel: 'Retail', items: [{ productId: product.id, quantity: 3, price: 0, cost: 0 }], amount: 0 };
  const first = (await ok('/api/records/sales', { method: 'POST', headers: { 'Idempotency-Key': key }, data: saleInput }, 201)).record;
  assert.equal(first.amount, 0.3);
  const second = (await ok('/api/records/sales', { method: 'POST', data: saleInput }, 201)).record;
  assert.notEqual(first.name, second.name);
  const replay = await ok('/api/records/sales', { method: 'POST', headers: { 'Idempotency-Key': key }, data: saleInput }, 201);
  assert.equal(replay.record.id, first.id); assert.equal(replay.inventory.find(item => item.id === product.id).stock, 6);
  const audits = await ok('/api/audit?limit=200');
  assert.equal(audits.events.filter(event => event.recordId === first.id && event.action === 'record.created').length, 1);
  assert.ok(audits.events.some(event => event.recordId === product.id && event.action === 'inventory.movement'));
  assert.doesNotMatch(JSON.stringify(audits), /passwordHash|password_hash|customer_email/);
  checks.push('Cent-exact authoritative totals, unique order numbers, fresh idempotency replays, and atomic audit records');

  const ownCookies = cookies;
  const otherCookies = new Map();
  const other = await ok('/api/workspace', { cookieJar: otherCookies });
  assert.notEqual(other.user.id, owner);
  const foreign = await call(`/api/records/inventory/${product.id}`, { cookieJar: otherCookies }); assert.equal(foreign.response.status, 404);
  const otherAudit = await ok('/api/audit', { cookieJar: otherCookies }); assert.ok(!otherAudit.events.some(event => event.recordId === product.id));
  checks.push('Single-record reads and audit history remain tenant-isolated');

  const a = { action: 'register', email: `claim-a-${stamp}@example.com`, password: randomBytes(20).toString('base64url'), name: 'Race A', storeName: 'Race store A' };
  const b = { ...a, email: `claim-b-${stamp}@example.com`, name: 'Race B' };
  const raceA = new Map(otherCookies), raceB = new Map(otherCookies);
  const claims = await Promise.all([call('/api/auth', { method: 'POST', data: a, cookieJar: raceA }), call('/api/auth', { method: 'POST', data: b, cookieJar: raceB })]);
  assert.deepEqual(claims.map(item => item.response.status).sort(), [201, 409]);
  checks.push('Simultaneous demo-account claims cannot overwrite an already-secured account');

  cookies = ownCookies;
  const email = `security-${stamp}@example.com`; const oldPassword = randomBytes(20).toString('base64url'); const newPassword = randomBytes(20).toString('base64url');
  await ok('/api/auth', { method: 'POST', data: { action: 'register', email, password: oldPassword, name: 'Security test', storeName: 'Security test store' } }, 201);
  const oldCookies = new Map(cookies);
  await ok('/api/auth', { method: 'POST', data: { action: 'password', password: newPassword, currentPassword: oldPassword } });
  const oldSession = await call('/api/records/inventory', { cookieJar: oldCookies }); assert.equal(oldSession.response.status, 401);
  assert.equal((await ok('/api/auth')).user.id, owner);
  checks.push('Password changes atomically revoke all earlier sessions and keep the new session valid');

  const throttleEmail = `throttle-${stamp}@example.com`;
  let limited;
  for (let attempt = 0; attempt < 13; attempt++) {
    const result = await call('/api/auth', { method: 'POST', data: { action: 'login', email: throttleEmail, password: 'invalid-password-for-test' } });
    if (result.response.status === 429) { limited = result; break; }
    assert.equal(result.response.status, 400);
  }
  assert.ok(limited); assert.ok(Number(limited.response.headers.get('Retry-After')) > 0);
  checks.push('Durable per-account login throttling returns a bounded Retry-After');

  // Remove only the explicit test records. Other workspace data is preserved.
  await ok(`/api/records/sales/${first.id}`, { method: 'DELETE' });
  await ok(`/api/records/sales/${second.id}`, { method: 'DELETE' });
  await ok(`/api/records/inventory/${product.id}`, { method: 'DELETE' });
  console.log(JSON.stringify({ status: 'PASS', checks }, null, 2));
} catch (error) { console.error(JSON.stringify({ status: 'FAIL', passed: checks }, null, 2)); throw error; }
