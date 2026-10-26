'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, addPaidSession } = require('./helpers');

const DAY = 86400;

test('webhook signature verification (Stripe test helper)', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_sigcheck0001', plan: 'perpetual', seats: 1, created: h.now() / 1000 });

  const ok = await h.sendEvent('checkout.session.completed', s);
  assert.equal(ok.status, 200);

  const wrongSecret = await h.sendEvent('checkout.session.completed', s, { secret: 'whsec_wrong_secret_value' });
  assert.equal(wrongSecret.status, 400);

  const noHeader = await h.sendEvent('checkout.session.completed', s, { header: '' });
  assert.equal(noHeader.status, 400);

  const tampered = await h.sendEvent('checkout.session.completed', s, { tamper: true });
  assert.equal(tampered.status, 400);

  const garbage = await h.sendEvent('checkout.session.completed', s, { header: 't=1,v1=deadbeef' });
  assert.equal(garbage.status, 400);
});

for (const plan of ['monthly', 'annual', 'perpetual']) {
  test(`checkout.session.completed (${plan}) creates exactly one Keygen license on the ${plan} policy and emails it once`, async (t) => {
    const h = await startApp();
    t.after(h.close);
    const nowS = h.now() / 1000;
    const periodEnd = nowS + (plan === 'monthly' ? 31 : 365) * DAY;
    h.stripe.subscriptions.set('sub_p', { id: 'sub_p', items: { data: [{ current_period_end: periodEnd }] } });
    const s = addPaidSession(h.stripe, { id: `cs_test_plan${plan}000001`, plan, subscription: plan === 'perpetual' ? null : 'sub_p', paymentIntent: plan === 'perpetual' ? 'pi_1' : null, created: nowS });
    const r = await h.sendEvent('checkout.session.completed', s);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'fulfilled');
    const lics = [...h.keygen.licenses.values()];
    assert.equal(lics.length, 1);
    const l = lics[0];
    assert.equal(l.policyId, `pol-${plan}`);
    assert.equal(l.maxMachines, 1);
    assert.equal(l.metadata.plan, plan);
    assert.equal(l.metadata.stripeSessionId, s.id);
    if (plan === 'perpetual') assert.equal(l.expiry, null, 'perpetual licences have no expiry');
    else assert.equal(l.expiry, new Date((periodEnd + 14 * DAY) * 1000).toISOString(), 'paid period + 14-day grace');
    assert.equal(h.mails.length, 1);
    assert.equal(h.mails[0].to, 'buyer@supplier.example');
    assert.ok(h.mails[0].text.includes(l.key));
    assert.ok(h.mails[0].html.includes(l.key));
    const label = { monthly: '$59/month', annual: '$590/year', perpetual: '$1,490' }[plan];
    assert.ok(h.mails[0].text.includes(label));
  });
}

test('idempotency: duplicate events, a second event for the same session, and success-page polling never create extra licenses', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_idem00000001', plan: 'perpetual', paymentIntent: 'pi_2', created: h.now() / 1000 });

  // Race: success page polls while the webhook arrives.
  const [a, b, c] = await Promise.all([
    h.sendEvent('checkout.session.completed', s, { id: 'evt_same_1' }),
    h.get(`/api/license?session_id=${s.id}`),
    h.get(`/api/license?session_id=${s.id}`),
  ]);
  assert.equal(a.status === 200 || a.status === 500, true); // 500 = "in progress, Stripe retries"
  assert.ok([200, 202].includes(b.status));
  assert.ok([200, 202].includes(c.status));

  const again = await h.sendEvent('checkout.session.completed', s, { id: 'evt_same_1' });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);

  const other = await h.sendEvent('checkout.session.completed', s, { id: 'evt_other_2' });
  assert.equal(other.status, 200);

  const page = await h.get(`/api/license?session_id=${s.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.licenses.length, 1);

  assert.equal(h.keygen.licenses.size, 1, 'exactly one licence per purchase');
  assert.equal(h.mails.length, 1, 'email sent exactly once');
  const rows = h.db.prepare('SELECT COUNT(*) n FROM licenses WHERE session_id = ?').get(s.id);
  assert.equal(rows.n, 1);
});

test('crash recovery: a seat already created in Keygen (but not saved locally) is reused, not duplicated', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_crash0000001', plan: 'perpetual', created: h.now() / 1000 });
  const pre = await h.keygen.createLicense({ policyId: 'pol-perpetual', maxMachines: 1, metadata: { stripeSessionId: s.id, seatIndex: '1' } });
  await h.sendEvent('checkout.session.completed', s);
  assert.equal(h.keygen.licenses.size, 1);
  const seat1 = h.db.prepare('SELECT keygen_id FROM licenses WHERE session_id = ? AND seat_index = 1').get(s.id);
  assert.equal(seat1.keygen_id, pre.id);
});

test('one license per purchase: a quantity above 1 (e.g. edited Payment Link) is refused, never over-issued', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_toomany00001', plan: 'perpetual', seats: 2, created: h.now() / 1000 });
  const r = await h.sendEvent('checkout.session.completed', s);
  assert.equal(r.status, 500); // logged + Stripe retries; owner refunds or fixes manually
  assert.equal(h.keygen.licenses.size, 0);
});

test('unpaid (async payment pending) sessions do not get licenses until payment succeeds', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_unpaid000001', plan: 'perpetual', seats: 1, paymentStatus: 'unpaid', created: h.now() / 1000 });
  await h.sendEvent('checkout.session.completed', s);
  assert.equal(h.keygen.licenses.size, 0);
  const page = await h.get(`/api/license?session_id=${s.id}`);
  assert.equal(page.status, 402);

  h.stripe.sessions.get(s.id).payment_status = 'paid';
  await h.sendEvent('checkout.session.async_payment_succeeded', s);
  assert.equal(h.keygen.licenses.size, 1);
});

test('annual: expiry = paid period end + 14-day grace; renewal extends; failed payment -> suspend only after grace; recovery reinstates', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  const periodEnd = nowS + 365 * DAY;
  h.stripe.subscriptions.set('sub_1', { id: 'sub_1', items: { data: [{ current_period_end: periodEnd }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_annual000001', plan: 'annual', subscription: 'sub_1', created: nowS });
  await h.sendEvent('checkout.session.completed', s);
  const lics = [...h.keygen.licenses.values()];
  assert.equal(lics.length, 1);
  for (const l of lics) {
    assert.equal(l.policyId, 'pol-annual');
    assert.equal(l.expiry, new Date((periodEnd + 14 * DAY) * 1000).toISOString());
  }

  // First invoice for the new subscription (may arrive any time): harmless.
  const first = await h.sendEvent('invoice.paid', { id: 'in_0', billing_reason: 'subscription_create', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } }, lines: { data: [{ period: { end: periodEnd } }] } });
  assert.equal(first.status, 200);

  // Renewal one year later (current API shape: invoice.parent.subscription_details).
  const newEnd = periodEnd + 365 * DAY;
  const ren = await h.sendEvent('invoice.paid', { id: 'in_1', billing_reason: 'subscription_cycle', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } }, lines: { data: [{ period: { end: newEnd } }] } });
  assert.equal(ren.status, 200);
  for (const l of h.keygen.licenses.values()) assert.equal(l.expiry, new Date((newEnd + 14 * DAY) * 1000).toISOString());

  // Older invoice shape (top-level invoice.subscription) is also understood.
  const newEnd2 = newEnd + 365 * DAY;
  await h.sendEvent('invoice.paid', { id: 'in_2', subscription: 'sub_1', lines: { data: [{ period: { end: newEnd2 } }] } });
  for (const l of h.keygen.licenses.values()) assert.equal(l.expiry, new Date((newEnd2 + 14 * DAY) * 1000).toISOString());

  // Renewal fails -> grace starts; nothing suspended yet.
  await h.sendEvent('invoice.payment_failed', { id: 'in_3', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } } });
  const p1 = h.db.prepare('SELECT * FROM purchases WHERE session_id = ?').get(s.id);
  assert.equal(p1.grace_until, nowS + 14 * DAY);
  assert.equal(await h.app.locals.fulfillment.runGraceSweep(), 0);
  assert.ok([...h.keygen.licenses.values()].every((l) => !l.suspended));

  // A second failure during grace does not extend the grace.
  h.advance(5 * DAY * 1000);
  await h.sendEvent('invoice.payment_failed', { id: 'in_4', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } } });
  assert.equal(h.db.prepare('SELECT grace_until FROM purchases WHERE session_id = ?').get(s.id).grace_until, nowS + 14 * DAY);

  // Subscription cancelled by Stripe during grace -> deferred to grace end.
  const del = await h.sendEvent('customer.subscription.deleted', { id: 'sub_1' });
  assert.equal(del.body.deferred_until, nowS + 14 * DAY);
  assert.ok([...h.keygen.licenses.values()].every((l) => !l.suspended));

  // Grace ends -> sweep suspends.
  h.advance(10 * DAY * 1000);
  assert.equal(await h.app.locals.fulfillment.runGraceSweep(), 1);
  assert.ok([...h.keygen.licenses.values()].every((l) => l.suspended));
  assert.equal(h.db.prepare('SELECT access_reason FROM purchases WHERE session_id = ?').get(s.id).access_reason, 'payment_failed');

  // Customer finally pays -> reinstated and grace cleared.
  await h.sendEvent('invoice.paid', { id: 'in_5', billing_reason: 'subscription_cycle', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } }, lines: { data: [{ period: { end: newEnd2 + 365 * DAY } }] } });
  assert.ok([...h.keygen.licenses.values()].every((l) => !l.suspended));
  const p2 = h.db.prepare('SELECT * FROM purchases WHERE session_id = ?').get(s.id);
  assert.equal(p2.access, 'active');
  assert.equal(p2.grace_until, null);
});

test('monthly: renewal each month extends expiry; failed payment -> 14-day grace -> suspend; payment recovers -> reinstate', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const nowS = h.now() / 1000;
  const end1 = nowS + 31 * DAY;
  h.stripe.subscriptions.set('sub_m', { id: 'sub_m', items: { data: [{ current_period_end: end1 }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_monthly00001', plan: 'monthly', subscription: 'sub_m', created: nowS });
  await h.sendEvent('checkout.session.completed', s);
  const [lic] = [...h.keygen.licenses.values()];
  assert.equal(lic.policyId, 'pol-monthly');
  assert.equal(lic.expiry, new Date((end1 + 14 * DAY) * 1000).toISOString());
  const parent = { type: 'subscription_details', subscription_details: { subscription: 'sub_m' } };

  const end2 = end1 + 30 * DAY;
  await h.sendEvent('invoice.paid', { id: 'in_m1', billing_reason: 'subscription_cycle', parent, lines: { data: [{ period: { end: end2 } }] } });
  assert.equal(h.keygen.licenses.get(lic.id).expiry, new Date((end2 + 14 * DAY) * 1000).toISOString());

  h.advance(31 * DAY * 1000);
  await h.sendEvent('invoice.payment_failed', { id: 'in_m2', parent });
  h.advance(13 * DAY * 1000);
  assert.equal(await h.app.locals.fulfillment.runGraceSweep(), 0, 'still inside grace on day 13');
  h.advance(1 * DAY * 1000 + 1000);
  assert.equal(await h.app.locals.fulfillment.runGraceSweep(), 1, 'suspended after 14 days');
  assert.equal(h.keygen.licenses.get(lic.id).suspended, true);

  await h.sendEvent('invoice.paid', { id: 'in_m3', billing_reason: 'subscription_cycle', parent, lines: { data: [{ period: { end: end2 + 30 * DAY } }] } });
  assert.equal(h.keygen.licenses.get(lic.id).suspended, false);
});

test('subscription ended without a failed payment (customer cancelled) suspends at once', async (t) => {
  const h = await startApp();
  t.after(h.close);
  h.stripe.subscriptions.set('sub_2', { id: 'sub_2', items: { data: [{ current_period_end: h.now() / 1000 + 365 * DAY }] } });
  const s = addPaidSession(h.stripe, { id: 'cs_test_cancel000001', plan: 'annual', seats: 1, subscription: 'sub_2', created: h.now() / 1000 });
  await h.sendEvent('checkout.session.completed', s);
  await h.sendEvent('customer.subscription.deleted', { id: 'sub_2' });
  assert.ok([...h.keygen.licenses.values()].every((l) => l.suspended));
});

test('refunds: full refund suspends (default) or revokes (REFUND_ACTION=revoke); partial refund changes nothing', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_refund000001', plan: 'perpetual', paymentIntent: 'pi_r1', created: h.now() / 1000 });
  await h.sendEvent('checkout.session.completed', s);

  await h.sendEvent('charge.refunded', { id: 'ch_1', refunded: false, amount_refunded: 100, payment_intent: 'pi_r1' });
  assert.ok([...h.keygen.licenses.values()].every((l) => !l.suspended));

  const r = await h.sendEvent('charge.refunded', { id: 'ch_1', refunded: true, payment_intent: 'pi_r1' });
  assert.equal(r.body.action, 'suspend');
  assert.ok([...h.keygen.licenses.values()].every((l) => l.suspended));

  const h2 = await startApp({ env: { REFUND_ACTION: 'revoke' } });
  t.after(h2.close);
  // Subscription refund: PaymentIntent -> InvoicePayment -> Invoice -> Subscription.
  h2.stripe.subscriptions.set('sub_r', { id: 'sub_r', items: { data: [{ current_period_end: h2.now() / 1000 + 365 * DAY }] } });
  const s2 = addPaidSession(h2.stripe, { id: 'cs_test_refund000002', plan: 'annual', seats: 1, subscription: 'sub_r', created: h2.now() / 1000 });
  await h2.sendEvent('checkout.session.completed', s2);
  h2.stripe.invoicePaymentsByPi.set('pi_sub_first', { id: 'in_x', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_r' } } });
  const r2 = await h2.sendEvent('charge.refunded', { id: 'ch_2', refunded: true, payment_intent: 'pi_sub_first' });
  assert.equal(r2.body.action, 'revoke');
  assert.equal(h2.keygen.licenses.size, 0);
  assert.equal(h2.db.prepare('SELECT state FROM licenses WHERE session_id = ?').get(s2.id).state, 'revoked');
});

test('disputes: created suspends; closed as won reinstates', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_dispute00001', plan: 'perpetual', seats: 1, paymentIntent: 'pi_d1', created: h.now() / 1000 });
  await h.sendEvent('checkout.session.completed', s);
  await h.sendEvent('charge.dispute.created', { id: 'dp_1', charge: 'ch_9', payment_intent: 'pi_d1' });
  assert.ok([...h.keygen.licenses.values()].every((l) => l.suspended));
  await h.sendEvent('charge.dispute.closed', { id: 'dp_1', status: 'won', payment_intent: 'pi_d1' });
  assert.ok([...h.keygen.licenses.values()].every((l) => !l.suspended));
});

test('payments for other products (unknown price) are ignored', async (t) => {
  const h = await startApp();
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_otherprod001', plan: 'perpetual', seats: 1, created: h.now() / 1000 });
  h.stripe.sessions.get(s.id).line_items.data[0].price.id = 'price_something_else';
  const r = await h.sendEvent('checkout.session.completed', s);
  assert.equal(r.status, 200);
  assert.equal(h.keygen.licenses.size, 0);
});

test('email failure does not lose the purchase; keys still shown on the success page', async (t) => {
  const h = await startApp({ mailFails: true });
  t.after(h.close);
  const s = addPaidSession(h.stripe, { id: 'cs_test_mailfail0001', plan: 'perpetual', seats: 1, created: h.now() / 1000 });
  const r = await h.sendEvent('checkout.session.completed', s);
  assert.equal(r.status, 200);
  const page = await h.get(`/api/license?session_id=${s.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.emailed, false);
  assert.equal(page.body.licenses.length, 1);
});
