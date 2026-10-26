'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, addPaidSession } = require('./helpers');

test('create-checkout-session validates input and requires the clickwrap agreement', async (t) => {
  const h = await startApp();
  t.after(h.close);
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'annual' })).status, 400);
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'annual', agreed: 'true' })).status, 400);
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'weekly', agreed: true })).status, 400);
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'annual', seats: 3, agreed: true })).status, 400, 'no seat math: one license per purchase');
  assert.equal(h.stripe.created.length, 0);
});

test('three plans: monthly + annual -> subscription mode, perpetual -> payment mode; quantity always 1; agreement version in metadata', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const expect = {
    monthly: { mode: 'subscription', price: 'price_monthly_test' },
    annual: { mode: 'subscription', price: 'price_annual_test' },
    perpetual: { mode: 'payment', price: 'price_perpetual_test' },
  };
  for (const [plan, e] of Object.entries(expect)) {
    const r = await h.post('/api/create-checkout-session', { plan, agreed: true });
    assert.equal(r.status, 200, plan);
    assert.match(r.body.url, /^https:\/\/checkout\.stripe\.test\//);
    const p = h.stripe.created.at(-1);
    assert.equal(p.mode, e.mode, plan);
    assert.deepEqual(p.line_items, [{ price: e.price, quantity: 1 }], plan);
    assert.equal(p.line_items[0].adjustable_quantity, undefined);
    assert.equal(p.metadata.plan, plan);
    assert.equal(p.metadata.license_agreement_version, '1.0');
    assert.equal(p.success_url, 'https://example.test/amcdt/success.html?session_id={CHECKOUT_SESSION_ID}');
    assert.equal(p.cancel_url, 'https://example.test/amcdt/cancel.html');
    if (e.mode === 'subscription') {
      assert.equal(p.subscription_data.metadata.plan, plan);
      assert.equal(p.customer_creation, undefined);
    } else {
      assert.equal(p.customer_creation, 'always');
      assert.equal(p.payment_intent_data.metadata.plan, 'perpetual');
    }
    assert.equal(p.automatic_tax, undefined, 'Stripe Tax off unless enabled');
  }
  // seats: 1 is tolerated (harmless), anything else refused (tested above)
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'monthly', seats: 1, agreed: true })).status, 200);
});

test('Stripe Tax can be switched on with STRIPE_AUTOMATIC_TAX=true', async (t) => {
  const h = await startApp({ env: { STRIPE_AUTOMATIC_TAX: 'true' } });
  t.after(h.close);
  await h.post('/api/create-checkout-session', { plan: 'perpetual', agreed: true });
  assert.deepEqual(h.stripe.created[0].automatic_tax, { enabled: true });
});

test('GET /api/license: validates session id, only returns keys for paid sessions, masks email', async (t) => {
  const h = await startApp();
  t.after(h.close);
  assert.equal((await h.get('/api/license')).status, 400);
  assert.equal((await h.get('/api/license?session_id=abc')).status, 400);
  assert.equal((await h.get('/api/license?session_id=cs_test_doesnotexist01')).status, 503);

  const unpaid = addPaidSession(h.stripe, { id: 'cs_test_unpaidpage001', plan: 'perpetual', seats: 1, paymentStatus: 'unpaid', created: h.now() / 1000 });
  assert.equal((await h.get(`/api/license?session_id=${unpaid.id}`)).status, 402);

  const s = addPaidSession(h.stripe, { id: 'cs_test_paidpage00001', plan: 'perpetual', created: h.now() / 1000 });
  const r = await h.get(`/api/license?session_id=${s.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ready');
  assert.equal(r.body.licenses.length, 1);
  assert.equal(r.body.plan, 'perpetual');
  assert.equal(r.body.email, 'bu***@supplier.example');
  assert.equal(r.body.emailed, true);

  // Old links stop showing keys (email remains the record).
  h.advance(8 * 86400 * 1000);
  assert.equal((await h.get(`/api/license?session_id=${s.id}`)).status, 410);
});

test('GET /api/license is rate limited', async (t) => {
  const h = await startApp({ env: { RATE_LIMIT_LICENSE_MAX: '3' } });
  t.after(h.close);
  const codes = [];
  for (let i = 0; i < 5; i += 1) codes.push((await h.get('/api/license?session_id=bad')).status);
  assert.deepEqual(codes, [400, 400, 400, 429, 429]);
});

test('unknown /api routes return 404 JSON', async (t) => {
  const h = await startApp();
  t.after(h.close);
  assert.equal((await h.get('/api/nope')).status, 404);
});
