'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, addPaidSession } = require('./helpers');

const DAY = 86400;

test('Any2K checkout creates one Keygen license on the 4K policy (max 2 machines) and emails the unlock key once', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  const periodEnd = nowS + 31 * DAY;
  h.stripe.subscriptions.set('sub_any2k', { id: 'sub_any2k', items: { data: [{ current_period_end: periodEnd }] }, metadata: {} });
  const s = addPaidSession(h.stripe, {
    id: 'cs_test_any2k_buy00001',
    plan: 'any2k',
    subscription: 'sub_any2k',
    customer: 'cus_any2k_1',
    created: nowS,
    metadata: { product: 'any2k' },
  });
  const r = await h.sendEvent('checkout.session.completed', s);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'fulfilled');
  const lics = [...h.keygen.licenses.values()];
  assert.equal(lics.length, 1);
  const l = lics[0];
  assert.equal(l.policyId, 'pol-any2k');
  assert.equal(l.maxMachines, 2);
  assert.equal(l.metadata.plan, 'any2k');
  assert.equal(l.metadata.product, 'any2k');
  assert.equal(l.metadata.stripeSessionId, s.id);
  assert.equal(l.expiry, new Date(periodEnd * 1000).toISOString(), 'Any2K expiry = period end (no AMCDT grace)');
  assert.equal(h.mails.length, 1);
  assert.equal(h.mails[0].subject, 'Your Any Video to 4K unlock key');
  assert.ok(h.mails[0].text.includes(l.key));
  assert.ok(h.mails[0].text.includes('$4.99/month for UNLIMITED 4K videos'));
  assert.ok(h.mails[0].text.includes('Works on 1 phone + 1 computer'));
  assert.ok(!/python|nexus|keygen/i.test(h.mails[0].text));
  // Stripe metadata written for idempotency across restarts
  assert.ok(h.stripe.metadataWrites.some((w) => w[0] === 'subscription' && w[1] === 'sub_any2k' && w[2].any2k_keygen_license_id === l.id));
  assert.ok(h.stripe.metadataWrites.some((w) => w[0] === 'customer' && w[1] === 'cus_any2k_1' && w[2].any2k_keygen_license_id === l.id));
});

test('Any2K webhook retries never create a second key', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  h.stripe.subscriptions.set('sub_any2k_i', { id: 'sub_any2k_i', items: { data: [{ current_period_end: nowS + 31 * DAY }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_any2k_idem0001', plan: 'any2k', subscription: 'sub_any2k_i', created: nowS });
  await h.sendEvent('checkout.session.completed', s, { id: 'evt_any2k_a' });
  const again = await h.sendEvent('checkout.session.completed', s, { id: 'evt_any2k_a' });
  assert.equal(again.body.duplicate, true);
  await h.sendEvent('checkout.session.completed', s, { id: 'evt_any2k_b' });
  assert.equal(h.keygen.licenses.size, 1);
  assert.equal(h.mails.length, 1);
});

test('Any2K: cancel suspends immediately; failed payment suspends immediately; paid renewal reinstates and extends', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  const periodEnd = nowS + 31 * DAY;
  h.stripe.subscriptions.set('sub_any2k_life', { id: 'sub_any2k_life', items: { data: [{ current_period_end: periodEnd }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_any2k_life0001', plan: 'any2k', subscription: 'sub_any2k_life', created: nowS });
  await h.sendEvent('checkout.session.completed', s);
  const lic = [...h.keygen.licenses.values()][0];
  assert.equal(lic.suspended, false);

  // Failed renewal -> suspend now (no 14-day grace for Any2K)
  const fail = await h.sendEvent('invoice.payment_failed', {
    id: 'in_fail',
    object: 'invoice',
    parent: { subscription_details: { subscription: 'sub_any2k_life' } },
    lines: { data: [{ period: { end: periodEnd } }] },
  });
  assert.equal(fail.status, 200);
  assert.equal(h.keygen.licenses.get(lic.id).suspended, true);
  const purchase = h.db.prepare('SELECT access, access_reason FROM purchases WHERE session_id = ?').get(s.id);
  assert.equal(purchase.access, 'suspended');
  assert.equal(purchase.access_reason, 'payment_failed');

  // Successful renewal -> reinstate + extend expiry
  const newEnd = periodEnd + 31 * DAY;
  h.stripe.subscriptions.set('sub_any2k_life', { id: 'sub_any2k_life', items: { data: [{ current_period_end: newEnd }] } });
  const paid = await h.sendEvent('invoice.paid', {
    id: 'in_paid',
    object: 'invoice',
    parent: { subscription_details: { subscription: 'sub_any2k_life' } },
    lines: { data: [{ period: { end: newEnd } }] },
  });
  assert.equal(paid.status, 200);
  assert.equal(h.keygen.licenses.get(lic.id).suspended, false);
  assert.equal(h.keygen.licenses.get(lic.id).expiry, new Date(newEnd * 1000).toISOString());
  assert.equal(h.db.prepare('SELECT access FROM purchases WHERE session_id = ?').get(s.id).access, 'active');
});

test('Any2K: customer.subscription.deleted suspends the key', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  h.stripe.subscriptions.set('sub_any2k_cancel', { id: 'sub_any2k_cancel', items: { data: [{ current_period_end: nowS + 31 * DAY }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_any2k_cancel01', plan: 'any2k', subscription: 'sub_any2k_cancel', created: nowS });
  await h.sendEvent('checkout.session.completed', s);
  const lic = [...h.keygen.licenses.values()][0];
  await h.sendEvent('customer.subscription.deleted', { id: 'sub_any2k_cancel', object: 'subscription' });
  assert.equal(h.keygen.licenses.get(lic.id).suspended, true);
  assert.equal(h.db.prepare('SELECT access_reason FROM purchases WHERE session_id = ?').get(s.id).access_reason, 'subscription_ended');
});

test('AMCDT monthly still uses max 1 machine and is unaffected by Any2K price config', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  h.stripe.subscriptions.set('sub_m', { id: 'sub_m', items: { data: [{ current_period_end: nowS + 31 * DAY }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_amcdt_still_ok1', plan: 'monthly', subscription: 'sub_m', created: nowS });
  await h.sendEvent('checkout.session.completed', s);
  const l = [...h.keygen.licenses.values()][0];
  assert.equal(l.policyId, 'pol-monthly');
  assert.equal(l.maxMachines, 1);
  assert.equal(h.mails[0].subject.includes('AMCDT'), true);
});
