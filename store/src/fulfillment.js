'use strict';
/**
 * Core purchase -> license logic. All external systems (Stripe, Keygen, mail)
 * are injected, so the same code runs in production and in the mocked tests.
 *
 * Idempotency, in three layers:
 *   1. processed_events: each Stripe event id is handled at most once.
 *   2. purchases row + lock: only one worker fulfils a Checkout Session at a
 *      time (webhook and success page can race; both call fulfillCheckout()).
 *   3. licenses UNIQUE(session_id, seat_index) + Keygen metadata lookup: a seat
 *      is never created twice, even if the process crashed between "created in
 *      Keygen" and "saved locally".
 *
 * The local database is a CACHE, not the source of truth. On hosts with an
 * ephemeral disk (DigitalOcean App Platform) it is empty after every deploy or
 * restart. Every lookup that misses locally is therefore rebuilt from Keygen
 * (each paid license carries its Stripe session, customer, subscription and
 * payment ids as metadata) and from Stripe (Checkout Sessions are re-read).
 */

const DAY = 86400;
const LOCK_STALE_SECONDS = 120;
// A license found in Keygen that is older than this, for a purchase we have no
// local record of, was fulfilled before a restart: do not email the key again.
const ALREADY_DELIVERED_AFTER_SECONDS = 15 * 60;

function createFulfillment({ db, stripe, keygen, mailer, config, now = () => Date.now(), log = console }) {
  const nowSec = () => Math.floor(now() / 1000);
  const graceSec = config.graceDays * DAY;

  const q = {
    getPurchase: db.prepare('SELECT * FROM purchases WHERE session_id = ?'),
    insertPurchase: db.prepare(`INSERT OR IGNORE INTO purchases
      (session_id, plan, seats, customer_id, customer_email, customer_name, subscription_id, payment_intent_id,
       agreement_version, agreed_at, trial_license_id, livemode, status, session_created, created_at, updated_at)
      VALUES (@session_id, @plan, @seats, @customer_id, @customer_email, @customer_name, @subscription_id, @payment_intent_id,
       @agreement_version, @agreed_at, @trial_license_id, @livemode, 'processing', @session_created, @now, @now)`),
    lock: db.prepare(`UPDATE purchases SET lock_at = @now, updated_at = @now
      WHERE session_id = @session_id AND status = 'processing' AND (lock_at IS NULL OR lock_at < @stale)`),
    unlock: db.prepare('UPDATE purchases SET lock_at = NULL WHERE session_id = ?'),
    markFulfilled: db.prepare(`UPDATE purchases SET status = 'fulfilled', lock_at = NULL, updated_at = ? WHERE session_id = ?`),
    licensesFor: db.prepare('SELECT * FROM licenses WHERE session_id = ? ORDER BY seat_index'),
    insertLicense: db.prepare(`INSERT OR IGNORE INTO licenses (session_id, seat_index, keygen_id, license_key, expiry, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`),
    setLicenseExpiry: db.prepare('UPDATE licenses SET expiry = ?, updated_at = ? WHERE id = ?'),
    setLicenseState: db.prepare('UPDATE licenses SET state = ?, updated_at = ? WHERE id = ?'),
    bySubscription: db.prepare('SELECT * FROM purchases WHERE subscription_id = ?'),
    byPaymentIntent: db.prepare('SELECT * FROM purchases WHERE payment_intent_id = ?'),
    byCustomer: db.prepare('SELECT * FROM purchases WHERE customer_id = ?'),
    setAccess: db.prepare('UPDATE purchases SET access = ?, access_reason = ?, updated_at = ? WHERE session_id = ?'),
    setGrace: db.prepare('UPDATE purchases SET grace_until = ?, updated_at = ? WHERE session_id = ?'),
    emailed: db.prepare('UPDATE purchases SET emailed_at = ?, email_attempts = email_attempts + 1, updated_at = ? WHERE session_id = ?'),
    emailFailed: db.prepare('UPDATE purchases SET email_attempts = email_attempts + 1, updated_at = ? WHERE session_id = ?'),
    graceExpired: db.prepare(`SELECT * FROM purchases WHERE plan IN ('monthly', 'annual') AND access = 'active' AND grace_until IS NOT NULL AND grace_until <= ?`),
    eventSeen: db.prepare('SELECT 1 FROM processed_events WHERE event_id = ?'),
    eventDone: db.prepare('INSERT OR IGNORE INTO processed_events (event_id, type, processed_at) VALUES (?, ?, ?)'),
    markTrialConverted: db.prepare(`UPDATE trials SET converted_session_id = ?, updated_at = ? WHERE keygen_id = ? AND converted_session_id IS NULL`),
  };

  const SUBSCRIPTION_PLANS = ['monthly', 'annual', 'any2k'];
  const isSubscription = (plan) => SUBSCRIPTION_PLANS.includes(plan);
  const isAny2k = (plan) => plan === 'any2k';

  function planForPrice(priceId) {
    if (priceId && priceId === config.stripe.priceMonthly) return 'monthly';
    if (priceId && priceId === config.stripe.priceAnnual) return 'annual';
    if (priceId && priceId === config.stripe.pricePerpetual) return 'perpetual';
    if (priceId && config.stripe.priceAny2k && priceId === config.stripe.priceAny2k) return 'any2k';
    return null;
  }

  function policyFor(plan) {
    if (plan === 'monthly') return config.keygen.policyMonthly;
    if (plan === 'annual') return config.keygen.policyAnnual;
    if (plan === 'any2k') return config.keygen.policyAny2k;
    return config.keygen.policyPerpetual;
  }

  function maxMachinesFor(plan) {
    // Any Video to 4K: one key unlocks 1 phone + 1 computer.
    return isAny2k(plan) ? 2 : 1;
  }

  function productNameFor(plan) {
    return isAny2k(plan) ? 'Any Video to 4K' : 'AMCDT';
  }

  /** Expiry ISO for a paid subscription period. AMCDT adds grace; Any2K uses period end only. */
  function expiryForPeriodEnd(plan, periodEndSec) {
    const extra = isAny2k(plan) ? 0 : graceSec;
    return new Date((periodEndSec + extra) * 1000).toISOString();
  }

  /** Works with both current (invoice.parent.subscription_details) and older invoice shapes. */
  function subscriptionIdFromInvoice(invoice) {
    const fromParent = invoice?.parent?.subscription_details?.subscription;
    const sub = fromParent || invoice?.subscription || null;
    return typeof sub === 'object' && sub ? sub.id : sub;
  }

  function idOf(v) { return v && typeof v === 'object' ? v.id : v || null; }

  async function subscriptionPeriodEnd(subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Current API: period lives on subscription items. Older: top level.
    const itemEnds = (sub.items?.data || []).map((i) => i.current_period_end).filter(Boolean);
    return itemEnds.length ? Math.max(...itemEnds) : sub.current_period_end;
  }

  function subscriptionExpiryIso(periodEndSec) {
    // AMCDT default: paid period PLUS the 14-day grace window.
    return new Date((periodEndSec + graceSec) * 1000).toISOString();
  }

  function publicLicenses(sessionId) {
    return q.licensesFor.all(sessionId).map((l) => ({ seat: l.seat_index, key: l.license_key, expiry: l.expiry, state: l.state }));
  }

  /**
   * Fulfil one Checkout Session: create one Keygen license per seat, save, email.
   * Safe to call any number of times, concurrently, from the webhook and from
   * GET /api/license.
   * @returns {Promise<{status: 'fulfilled'|'pending'|'unpaid'|'ignored', purchase?, licenses?}>}
   */
  async function fulfillCheckout(sessionId) {
    let existing = q.getPurchase.get(sessionId);
    const hadLocalRecord = !!existing;
    if (existing && existing.status === 'fulfilled') {
      await maybeSendEmail(existing);
      return { status: 'fulfilled', purchase: q.getPurchase.get(sessionId), licenses: publicLicenses(sessionId) };
    }

    // Always re-read the session from Stripe: never trust client input or a stale payload.
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) {
      return { status: 'unpaid', session };
    }

    // Plan and seat count come from the actual line items (authoritative),
    // which also makes Stripe Payment Links work without custom metadata.
    const items = session.line_items?.data || [];
    const ours = items.map((li) => ({ plan: planForPrice(li.price?.id), qty: li.quantity || 0 })).filter((x) => x.plan);
    if (!ours.length) {
      log.warn?.(`[fulfil] session ${sessionId} has no known Mercy Systems price; ignoring`);
      return { status: 'ignored' };
    }
    const plan = ours[0].plan;
    const seats = ours.filter((x) => x.plan === plan).reduce((a, b) => a + b.qty, 0);
    if (seats < 1 || seats > config.maxSeats) throw new Error(`Seat count out of range: ${seats}`);
    if (session.metadata?.seats && Number(session.metadata.seats) !== seats) {
      log.warn?.(`[fulfil] metadata seats (${session.metadata.seats}) != line item quantity (${seats}); using line items`);
    }

    const t = nowSec();
    q.insertPurchase.run({
      session_id: sessionId,
      plan,
      seats,
      customer_id: idOf(session.customer),
      customer_email: session.customer_details?.email || session.customer_email || null,
      customer_name: session.customer_details?.name || null,
      subscription_id: idOf(session.subscription),
      payment_intent_id: idOf(session.payment_intent),
      agreement_version: session.metadata?.license_agreement_version || null,
      agreed_at: session.metadata?.agreed_at || null,
      trial_license_id: session.metadata?.trial_license_id || null,
      livemode: session.livemode ? 1 : 0,
      session_created: session.created || t,
      now: t,
    });

    const got = q.lock.run({ session_id: sessionId, now: t, stale: t - LOCK_STALE_SECONDS });
    if (got.changes === 0) {
      existing = q.getPurchase.get(sessionId);
      if (existing.status === 'fulfilled') {
        return { status: 'fulfilled', purchase: existing, licenses: publicLicenses(sessionId) };
      }
      return { status: 'pending' }; // someone else is working on it right now
    }

    try {
      const purchase = q.getPurchase.get(sessionId);
      let expiry = null;
      if (isSubscription(plan)) {
        if (!purchase.subscription_id) throw new Error(`${plan} purchase without subscription id`);
        expiry = expiryForPeriodEnd(plan, await subscriptionPeriodEnd(purchase.subscription_id));
      }
      if (isAny2k(plan) && !config.keygen.policyAny2k) {
        throw new Error('Any Video to 4K price matched but KEYGEN_POLICY_ANY2K is not configured');
      }
      const have = new Set(q.licensesFor.all(sessionId).map((l) => l.seat_index));
      let createdNow = 0;
      let foundOld = 0;
      let primaryLicenseId = null;
      for (let seat = 1; seat <= seats; seat += 1) {
        if (have.has(seat)) continue;
        // Crash-safety: if this seat was already created in Keygen, reuse it.
        const found = await keygen.findLicensesByMetadata({ stripeSessionId: sessionId, seatIndex: String(seat) });
        if (found[0]) {
          const createdSec = found[0].created ? Math.floor(Date.parse(found[0].created) / 1000) : null;
          if (createdSec && t - createdSec > ALREADY_DELIVERED_AFTER_SECONDS) foundOld += 1;
        } else {
          createdNow += 1;
        }
        const lic = found[0] || await keygen.createLicense({
          policyId: policyFor(plan),
          name: `${productNameFor(plan)} ${plan} - seat ${seat} of ${seats}`,
          expiry,
          maxMachines: maxMachinesFor(plan),
          metadata: {
            stripeSessionId: sessionId,
            seatIndex: String(seat),
            seats: String(seats),
            kind: 'paid',
            product: isAny2k(plan) ? 'any2k' : 'amcdt',
            plan,
            stripeCustomerId: purchase.customer_id || '',
            stripeSubscriptionId: purchase.subscription_id || '',
            stripePaymentIntentId: purchase.payment_intent_id || '',
            email: purchase.customer_email || '',
            licenseAgreementVersion: purchase.agreement_version || '',
            trialLicenseId: purchase.trial_license_id || '',
          },
        });
        primaryLicenseId = primaryLicenseId || lic.id;
        q.insertLicense.run(sessionId, seat, lic.id, lic.key, lic.expiry || expiry, t, t);
        if (found[0] && found[0].suspended) {
          // Rebuilt after a restart: keep Keygen's suspension visible locally.
          const row = q.licensesFor.all(sessionId).find((r) => r.keygen_id === lic.id);
          if (row) q.setLicenseState.run('suspended', t, row.id);
          q.setAccess.run('suspended', 'unknown', t, sessionId);
        }
      }
      // Idempotent cross-store: remember the Keygen license id on the Stripe subscription/customer.
      if (primaryLicenseId) {
        await writeStripeLicenseMetadata(purchase, plan, primaryLicenseId);
      }
      q.markFulfilled.run(nowSec(), sessionId);
      if (!hadLocalRecord && createdNow === 0 && foundOld > 0 && foundOld === seats) {
        // Rebuilt after a restart: the key was delivered long ago; do not email it again.
        q.emailed.run(nowSec(), nowSec(), sessionId);
      }
      if (purchase.trial_license_id) q.markTrialConverted.run(sessionId, nowSec(), purchase.trial_license_id);
    } catch (err) {
      q.unlock.run(sessionId);
      throw err;
    }

    const done = q.getPurchase.get(sessionId);
    await maybeSendEmail(done);
    return { status: 'fulfilled', purchase: q.getPurchase.get(sessionId), licenses: publicLicenses(sessionId) };
  }

  async function writeStripeLicenseMetadata(purchase, plan, licenseId) {
    const metaKey = isAny2k(plan) ? 'any2k_keygen_license_id' : 'amcdt_keygen_license_id';
    const product = isAny2k(plan) ? 'any2k' : 'amcdt';
    try {
      if (purchase.subscription_id && stripe.subscriptions?.update) {
        await stripe.subscriptions.update(purchase.subscription_id, {
          metadata: { [metaKey]: licenseId, product, plan },
        });
      }
      if (purchase.customer_id && stripe.customers?.update) {
        await stripe.customers.update(purchase.customer_id, {
          metadata: { [metaKey]: licenseId },
        });
      }
    } catch (err) {
      // Non-fatal: Keygen metadata + local DB still provide idempotency.
      log.warn?.(`[fulfil] could not write Stripe license metadata: ${err.message}`);
    }
  }

  async function maybeSendEmail(purchase) {
    if (purchase.emailed_at || purchase.email_attempts >= 5 || !purchase.customer_email || !mailer) return;
    const { buildLicenseEmail, buildAny2kEmail } = require('./mailer');
    const licenses = q.licensesFor.all(purchase.session_id);
    const msg = isAny2k(purchase.plan)
      ? buildAny2kEmail({
          purchase,
          licenses,
          siteUrl: config.siteUrlAny2k || 'https://mercysystems.com/4k',
          manageUrl: config.stripe.portalLoginUrl || 'https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000',
          supportEmail: config.supportEmail,
        })
      : buildLicenseEmail({ purchase, licenses, siteUrl: config.siteUrl, productVersion: config.productVersion || '[VERSION]', supportEmail: config.supportEmail });
    try {
      await mailer.send({ to: purchase.customer_email, ...msg });
      q.emailed.run(nowSec(), nowSec(), purchase.session_id);
    } catch (err) {
      q.emailFailed.run(nowSec(), purchase.session_id);
      log.error?.(`[email] failed for ${purchase.session_id}: ${err.message}`);
    }
  }

  // ---- access changes ----------------------------------------------------

  async function suspendPurchase(purchase, reason) {
    for (const l of q.licensesFor.all(purchase.session_id)) {
      if (l.state !== 'active') continue;
      await keygen.suspend(l.keygen_id);
      q.setLicenseState.run('suspended', nowSec(), l.id);
    }
    q.setAccess.run('suspended', reason, nowSec(), purchase.session_id);
  }

  async function revokePurchase(purchase, reason) {
    for (const l of q.licensesFor.all(purchase.session_id)) {
      if (l.state === 'revoked') continue;
      await keygen.revoke(l.keygen_id);
      q.setLicenseState.run('revoked', nowSec(), l.id);
    }
    q.setAccess.run('revoked', reason, nowSec(), purchase.session_id);
  }

  async function reinstatePurchase(purchase) {
    for (const l of q.licensesFor.all(purchase.session_id)) {
      if (l.state !== 'suspended') continue;
      await keygen.reinstate(l.keygen_id);
      q.setLicenseState.run('active', nowSec(), l.id);
    }
    q.setAccess.run('active', null, nowSec(), purchase.session_id);
  }

  // ---- rebuild local records from Keygen (after a restart / fresh disk) ----

  /**
   * Find paid licenses in Keygen by metadata and recreate the local purchase +
   * license rows. Returns the purchase row, or null when nothing (or more than
   * one purchase, i.e. an ambiguous match) is found.
   */
  async function rehydrate(meta) {
    if (!keygen.findLicensesByMetadata) return null;
    const found = (await keygen.findLicensesByMetadata({ kind: 'paid', ...meta }))
      .filter((l) => l.metadata && l.metadata.stripeSessionId);
    const sessions = [...new Set(found.map((l) => l.metadata.stripeSessionId))];
    if (sessions.length !== 1) return null;
    const sessionId = sessions[0];
    const local = q.getPurchase.get(sessionId);
    if (local) return local;
    const m = found[0].metadata;
    const t = nowSec();
    const anySuspended = found.some((l) => l.suspended);
    q.insertPurchase.run({
      session_id: sessionId,
      plan: m.plan || 'perpetual',
      seats: Number(m.seats || found.length) || 1,
      customer_id: m.stripeCustomerId || null,
      customer_email: m.email || null,
      customer_name: null,
      subscription_id: m.stripeSubscriptionId || null,
      payment_intent_id: m.stripePaymentIntentId || null,
      agreement_version: m.licenseAgreementVersion || null,
      agreed_at: null,
      trial_license_id: m.trialLicenseId || null,
      livemode: sessionId.startsWith('cs_live_') ? 1 : 0,
      session_created: null,
      now: t,
    });
    for (const l of found) {
      q.insertLicense.run(sessionId, Number(l.metadata.seatIndex || 1), l.id, l.key, l.expiry, t, t);
      if (l.suspended) {
        const row = q.licensesFor.all(sessionId).find((r) => r.keygen_id === l.id);
        if (row) q.setLicenseState.run('suspended', t, row.id);
      }
    }
    q.markFulfilled.run(t, sessionId);
    q.emailed.run(t, t, sessionId); // it was delivered when it was first created
    // The original reason for a suspension is not stored in Keygen: 'unknown' is never lifted automatically.
    if (anySuspended) q.setAccess.run('suspended', 'unknown', t, sessionId);
    log.info?.(`[rehydrate] rebuilt purchase ${sessionId} from Keygen`);
    return q.getPurchase.get(sessionId);
  }

  async function purchaseBySubscription(subId) {
    if (!subId) return null;
    return q.bySubscription.get(subId) || rehydrate({ stripeSubscriptionId: subId });
  }

  async function findPurchaseForCharge({ paymentIntentId, customerId }) {
    if (paymentIntentId) {
      const direct = q.byPaymentIntent.get(paymentIntentId) || await rehydrate({ stripePaymentIntentId: paymentIntentId });
      if (direct) return direct;
      // Subscription payments: PaymentIntent -> InvoicePayment -> Invoice -> Subscription
      if (stripe.invoicePayments?.list) {
        const list = await stripe.invoicePayments.list({
          payment: { type: 'payment_intent', payment_intent: paymentIntentId },
          expand: ['data.invoice'],
          limit: 1,
        });
        const inv = list.data?.[0]?.invoice;
        const invoice = typeof inv === 'string' ? await stripe.invoices.retrieve(inv) : inv;
        const subId = invoice ? subscriptionIdFromInvoice(invoice) : null;
        if (subId) {
          const p = await purchaseBySubscription(subId);
          if (p) return p;
        }
      }
    }
    if (customerId) {
      const all = q.byCustomer.all(customerId);
      if (all.length === 1) return all[0]; // only unambiguous matches
      if (all.length === 0) return rehydrate({ stripeCustomerId: customerId }); // null if ambiguous
    }
    return null;
  }

  // ---- webhook dispatch -------------------------------------------------

  async function handleEvent(event) {
    if (q.eventSeen.get(event.id)) return { duplicate: true };
    const obj = event.data.object;
    let result = { handled: true };

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const r = await fulfillCheckout(obj.id);
        if (r.status === 'pending') {
          // Another worker holds the lock; let Stripe retry later.
          throw Object.assign(new Error('Fulfilment in progress'), { retryable: true });
        }
        result = { handled: true, status: r.status };
        break;
      }

      case 'invoice.paid': {
        const subId = subscriptionIdFromInvoice(obj);
        if (!subId) { result = { handled: false, reason: 'not a subscription invoice' }; break; }
        const purchase = await purchaseBySubscription(subId);
        if (!purchase) {
          // First invoice can arrive before checkout.session.completed: that
          // handler sets the expiry itself, so nothing to do here.
          result = { handled: false, reason: 'no purchase yet for subscription' };
          break;
        }
        const ends = (obj.lines?.data || []).map((l) => l.period?.end).filter(Boolean);
        const periodEnd = ends.length ? Math.max(...ends) : await subscriptionPeriodEnd(subId);
        const expiry = expiryForPeriodEnd(purchase.plan, periodEnd);
        for (const l of q.licensesFor.all(purchase.session_id)) {
          if (l.state === 'revoked') continue;
          if (l.expiry !== expiry) {
            await keygen.setExpiry(l.keygen_id, expiry);
            q.setLicenseExpiry.run(expiry, nowSec(), l.id);
          }
        }
        q.setGrace.run(null, nowSec(), purchase.session_id);
        // Payment recovered: lift a non-payment suspension (never a refund/dispute one).
        if (purchase.access === 'suspended' && ['payment_failed', 'subscription_ended'].includes(purchase.access_reason)) {
          await reinstatePurchase(purchase);
        }
        result = { handled: true, expiry };
        break;
      }

      case 'invoice.payment_failed': {
        const subId = subscriptionIdFromInvoice(obj);
        const purchase = subId && await purchaseBySubscription(subId);
        if (!purchase) { result = { handled: false }; break; }
        if (isAny2k(purchase.plan)) {
          // Any Video to 4K: suspend the unlock key as soon as a renewal payment fails.
          if (purchase.access === 'active') await suspendPurchase(purchase, 'payment_failed');
          result = { handled: true, suspended: true };
        } else {
          if (!purchase.grace_until) {
            q.setGrace.run(nowSec() + graceSec, nowSec(), purchase.session_id);
          }
          result = { handled: true, grace_until: q.getPurchase.get(purchase.session_id).grace_until };
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const purchase = await purchaseBySubscription(obj.id);
        if (!purchase) { result = { handled: false }; break; }
        if (isAny2k(purchase.plan)) {
          // Cancelled Any Video to 4K subscription: suspend the key immediately.
          if (purchase.access === 'active') await suspendPurchase(purchase, 'subscription_ended');
          result = { handled: true, suspended: true };
        } else if (purchase.grace_until && purchase.grace_until > nowSec()) {
          // Still inside the 14-day grace: the grace sweep suspends at grace_until.
          result = { handled: true, deferred_until: purchase.grace_until };
        } else if (purchase.access === 'active') {
          await suspendPurchase(purchase, 'subscription_ended');
        }
        break;
      }

      case 'charge.refunded': {
        if (!obj.refunded) { result = { handled: false, reason: 'partial refund - no licence change' }; break; }
        const purchase = await findPurchaseForCharge({ paymentIntentId: idOf(obj.payment_intent), customerId: idOf(obj.customer) });
        if (!purchase) { result = { handled: false, reason: 'no matching purchase' }; break; }
        if (config.refundAction === 'revoke') await revokePurchase(purchase, 'refund');
        else await suspendPurchase(purchase, 'refund');
        result = { handled: true, action: config.refundAction };
        break;
      }

      case 'charge.dispute.created': {
        let customerId = null;
        let pi = idOf(obj.payment_intent);
        if (!pi && obj.charge && stripe.charges?.retrieve) {
          const ch = await stripe.charges.retrieve(idOf(obj.charge));
          pi = idOf(ch.payment_intent); customerId = idOf(ch.customer);
        }
        const purchase = await findPurchaseForCharge({ paymentIntentId: pi, customerId });
        if (!purchase) { result = { handled: false }; break; }
        if (purchase.access === 'active') await suspendPurchase(purchase, 'dispute');
        break;
      }

      case 'charge.dispute.closed': {
        if (obj.status !== 'won') break;
        const purchase = await findPurchaseForCharge({ paymentIntentId: idOf(obj.payment_intent) });
        if (purchase && purchase.access === 'suspended' && purchase.access_reason === 'dispute') await reinstatePurchase(purchase);
        break;
      }

      default:
        result = { handled: false, reason: 'event type not used' };
    }

    q.eventDone.run(event.id, event.type, nowSec());
    return result;
  }

  /** Suspend subscription (monthly/annual) licences whose 14-day grace has run out. Run hourly. */
  async function runGraceSweep() {
    const due = q.graceExpired.all(nowSec());
    for (const p of due) {
      try { await suspendPurchase(p, 'payment_failed'); } catch (e) { log.error?.(`[grace] ${p.session_id}: ${e.message}`); }
    }
    return due.length;
  }

  return { fulfillCheckout, handleEvent, runGraceSweep, publicLicenses, subscriptionIdFromInvoice, rehydrate };
}

module.exports = { createFulfillment };
