'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, addPaidSession } = require('./helpers');

async function buyOne(h, { plan = 'monthly', email = 'Buyer@Supplier.example', customer = 'cus_portal_1' } = {}) {
  const id = `cs_test_portal${Math.random().toString(36).slice(2, 14)}`;
  const sub = plan === 'perpetual' ? null : `sub_${id.slice(-8)}`;
  if (sub) h.stripe.subscriptions.set(sub, { id: sub, status: 'active', items: { data: [{ current_period_end: Math.floor(h.now() / 1000) + 30 * 86400 }] } });
  addPaidSession(h.stripe, { id, plan, email, customer, subscription: sub, paymentIntent: plan === 'perpetual' ? 'pi_x' : null });
  const r = await h.get(`/api/license?session_id=${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.licenses[0].key;
}

function withPortal(h) {
  const calls = [];
  h.stripe.billingPortal = { sessions: { async create(p) { calls.push(p); return { url: `https://billing.stripe.test/session/${p.customer}` }; } } };
  return calls;
}

test('billing portal: email + license key opens a portal session for that customer', async () => {
  const h = await startApp();
  try {
    const calls = withPortal(h);
    const key = await buyOne(h);
    const r = await h.post('/api/billing-portal', { email: ' buyer@supplier.EXAMPLE ', license_key: key });
    assert.equal(r.status, 200);
    assert.equal(r.body.url, 'https://billing.stripe.test/session/cus_portal_1');
    assert.equal(calls[0].customer, 'cus_portal_1');
    assert.equal(calls[0].return_url, 'https://example.test/amcdt/manage.html');
  } finally { await h.close(); }
});

test('billing portal: wrong email, wrong key or trial key -> same not-found answer, no portal call', async () => {
  const h = await startApp({ env: { STRIPE_PORTAL_LOGIN_URL: 'https://billing.stripe.test/p/login/abc' } });
  try {
    const calls = withPortal(h);
    const key = await buyOne(h, { plan: 'perpetual' });
    const cases = [
      { email: 'other@supplier.example', license_key: key },
      { email: 'buyer@supplier.example', license_key: 'NOT-A-KEY' },
      { email: '', license_key: key },
      { email: 'buyer@supplier.example' },
    ];
    const bodies = [];
    for (const c of cases) {
      const r = await h.post('/api/billing-portal', c);
      assert.equal(r.status, 404);
      bodies.push(JSON.stringify(r.body));
      assert.equal(r.body.portal_login_url, 'https://billing.stripe.test/p/login/abc');
      assert.ok(r.body.error.includes('danny@mercysystems.com'));
    }
    assert.equal(new Set(bodies).size, 1, 'identical answers');
    assert.equal(calls.length, 0);
    // perpetual purchases also have a customer -> invoices in the portal
    const ok = await h.post('/api/billing-portal', { email: 'buyer@supplier.example', license_key: key });
    assert.equal(ok.status, 200);
  } finally { await h.close(); }
});

test('billing portal: Stripe failure -> 502 with support email; rate limited', async () => {
  const h = await startApp({ env: { RATE_LIMIT_PORTAL_MAX: '3' } });
  try {
    h.stripe.billingPortal = { sessions: { async create() { throw new Error('portal not activated'); } } };
    const key = await buyOne(h);
    const r = await h.post('/api/billing-portal', { email: 'buyer@supplier.example', license_key: key });
    assert.equal(r.status, 502);
    assert.ok(r.body.error.includes('danny@mercysystems.com'));
    await h.post('/api/billing-portal', { email: 'x@y.z', license_key: 'a' });
    await h.post('/api/billing-portal', { email: 'x@y.z', license_key: 'a' });
    const limited = await h.post('/api/billing-portal', { email: 'x@y.z', license_key: 'a' });
    assert.equal(limited.status, 429);
  } finally { await h.close(); }
});
