'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, addPaidSession } = require('./helpers');
const { normalizeEmail } = require('../src/trials');

test('trial: valid business email -> one trial license on the TRIAL policy, key sent by email only', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const r = await h.post('/api/trial', { email: 'Engineer@Tier2-Supplier.example', agreed: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(!JSON.stringify(r.body).includes('TEST-KEY'), 'key is never returned on screen');

  const lics = [...h.keygen.licenses.values()];
  assert.equal(lics.length, 1);
  assert.equal(lics[0].policyId, 'pol-trial');
  assert.equal(lics[0].maxMachines, 1);
  assert.equal(lics[0].metadata.kind, 'trial');
  assert.equal(lics[0].expiry, new Date(h.now() + 14 * 86400 * 1000).toISOString());

  assert.equal(h.mails.length, 1);
  assert.equal(h.mails[0].to, 'Engineer@Tier2-Supplier.example');
  assert.ok(h.mails[0].text.includes(lics[0].key));
  assert.ok(h.mails[0].text.includes(`/amcdt/buy?trial=${lics[0].id}`));
  assert.match(h.mails[0].subject, /14-day/);

  const row = h.db.prepare('SELECT * FROM trials').get();
  assert.equal(row.email_norm, 'engineer@tier2-supplier.example');
  assert.equal(row.keygen_id, lics[0].id);
});

test('trial: one per email (case, +tags) -> re-sends existing key, never a second license; resends are capped', async (t) => {
  const h = await startApp({ env: { TRIAL_RESEND_COOLDOWN_SEC: '0', TRIAL_MAX_RESENDS: '2', RATE_LIMIT_TRIAL_MAX: '50' } });
  t.after(h.close);
  await h.post('/api/trial', { email: 'a.b@firm.example', agreed: true });
  const r2 = await h.post('/api/trial', { email: 'A.B+again@FIRM.example', agreed: true });
  assert.equal(r2.status, 200);
  await h.post('/api/trial', { email: 'a.b@firm.example', agreed: true });
  await h.post('/api/trial', { email: 'a.b@firm.example', agreed: true });
  assert.equal(h.keygen.licenses.size, 1);
  assert.equal(h.mails.length, 3, '1 original + 2 resends (cap)');
  assert.equal(new Set(h.mails.map((m) => m.text.match(/TEST-KEY-\S+/)[0])).size, 1);
});

test('trial: concurrent requests for the same email create only one license', async (t) => {
  const h = await startApp({ env: { RATE_LIMIT_TRIAL_MAX: '50' } });
  t.after(h.close);
  await Promise.all([1, 2, 3, 4].map(() => h.post('/api/trial', { email: 'race@firm.example', agreed: true })));
  assert.equal(h.keygen.licenses.size, 1);
});

test('trial: rejects bad input, disposable domains, missing agreement; optional webmail block', async (t) => {
  const h = await startApp({ env: { RATE_LIMIT_TRIAL_MAX: '50' } });
  t.after(h.close);
  assert.equal((await h.post('/api/trial', { email: 'not-an-email', agreed: true })).status, 400);
  assert.equal((await h.post('/api/trial', { email: 'x@mailinator.com', agreed: true })).status, 400);
  assert.equal((await h.post('/api/trial', { email: 'x@firm.example' })).status, 400);
  assert.equal((await h.post('/api/trial', { email: 'x@gmail.com', agreed: true })).status, 200, 'webmail allowed by default');
  assert.equal(h.keygen.licenses.size, 1);

  const h2 = await startApp({ env: { TRIAL_BLOCK_FREE_WEBMAIL: 'true', TRIAL_BLOCKED_DOMAINS: 'spam.example' } });
  t.after(h2.close);
  assert.equal((await h2.post('/api/trial', { email: 'x@gmail.com', agreed: true })).status, 400);
  assert.equal((await h2.post('/api/trial', { email: 'x@spam.example', agreed: true })).status, 400);
});

test('trial: rate limited per IP', async (t) => {
  const h = await startApp({ env: { RATE_LIMIT_TRIAL_MAX: '2' } });
  t.after(h.close);
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await h.post('/api/trial', { email: `p${i}@firm.example`, agreed: true })).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
});

test('trial: Keygen outage -> friendly 503 and the email can retry later', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const orig = h.keygen.createLicense;
  h.keygen.createLicense = async () => { throw new Error('keygen down'); };
  assert.equal((await h.post('/api/trial', { email: 'retry@firm.example', agreed: true })).status, 503);
  h.keygen.createLicense = orig;
  assert.equal((await h.post('/api/trial', { email: 'retry@firm.example', agreed: true })).status, 200);
  assert.equal(h.keygen.licenses.size, 1);
});

test('conversion: buy link with trial id works for all three plans, pre-fills email, records trial id; webhook issues a NEW paid key and marks the trial converted', async (t) => {
  const h = await startApp();
  t.after(h.close);
  await h.post('/api/trial', { email: 'convert@firm.example', agreed: true });
  const trial = h.db.prepare('SELECT * FROM trials').get();

  for (const plan of ['monthly', 'annual', 'perpetual']) {
    const c = await h.post('/api/create-checkout-session', { plan, agreed: true, trial_license_id: trial.keygen_id });
    assert.equal(c.status, 200, plan);
    const params = h.stripe.created.at(-1);
    assert.equal(params.customer_email, 'convert@firm.example');
    assert.equal(params.metadata.trial_license_id, trial.keygen_id);
    assert.deepEqual(params.line_items[0].quantity, 1);
  }

  // Unknown trial ids never block a purchase; malformed ones are rejected cleanly.
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'perpetual', agreed: true, trial_license_id: '00000000-0000-0000-0000-000000000000' })).status, 200);
  assert.equal(h.stripe.created.at(-1).customer_email, undefined);
  assert.equal((await h.post('/api/create-checkout-session', { plan: 'perpetual', agreed: true, trial_license_id: '../etc' })).status, 400);

  h.stripe.subscriptions.set('sub_c', { id: 'sub_c', items: { data: [{ current_period_end: h.now() / 1000 + 31 * 86400 }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_convert00001', plan: 'monthly', subscription: 'sub_c', email: 'convert@firm.example', metadata: { trial_license_id: trial.keygen_id }, created: h.now() / 1000 });
  await h.sendEvent('checkout.session.completed', s);
  const paid = [...h.keygen.licenses.values()].filter((l) => l.policyId === 'pol-monthly');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].metadata.trialLicenseId, trial.keygen_id);
  assert.notEqual(paid[0].key, trial.license_key, 'paid key is a new key');
  assert.ok(h.keygen.licenses.has(trial.keygen_id), 'trial licence left in place to expire naturally');
  assert.equal(h.db.prepare('SELECT converted_session_id FROM trials').get().converted_session_id, s.id);
});

test('normalizeEmail', () => {
  assert.equal(normalizeEmail(' John.Doe+x@GMail.com '), 'johndoe@gmail.com');
  assert.equal(normalizeEmail('j.doe+tag@firm.de'), 'j.doe@firm.de');
});
