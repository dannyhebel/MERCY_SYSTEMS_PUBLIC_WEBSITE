'use strict';
/**
 * Test doubles. Nothing here talks to the network:
 *  - Stripe API calls are fakes; webhook signing/verification uses the REAL
 *    Stripe SDK helpers (generateTestHeaderString / constructEvent).
 *  - Keygen is an in-memory fake with the same interface as src/keygen.js.
 *  - Mail is captured in an array.
 */
const crypto = require('crypto');
const Stripe = require('stripe');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const WEBHOOK_SECRET = 'whsec_test_' + 'x'.repeat(24);
const realStripe = new Stripe('sk_test_dummy_not_a_real_key');

function makeConfig(overrides = {}) {
  const cfg = loadConfig({
    SITE_URL: 'https://example.test/amcdt',
    STRIPE_SECRET_KEY: 'sk_test_dummy_not_a_real_key',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_MONTHLY: 'price_monthly_test',
    STRIPE_PRICE_ANNUAL: 'price_annual_test',
    STRIPE_PRICE_PERPETUAL: 'price_perpetual_test',
    STRIPE_PRICE_ANY2K: 'price_any2k_test',
    KEYGEN_API_URL: 'https://keygen.invalid',
    KEYGEN_ACCOUNT_ID: 'acct-test',
    KEYGEN_ADMIN_TOKEN: 'admin-test-token',
    KEYGEN_POLICY_MONTHLY: 'pol-monthly',
    KEYGEN_POLICY_ANNUAL: 'pol-annual',
    KEYGEN_POLICY_PERPETUAL: 'pol-perpetual',
    KEYGEN_POLICY_ANY2K: 'pol-any2k',
    KEYGEN_POLICY_TRIAL: 'pol-trial',
    STRIPE_PORTAL_LOGIN_URL: 'https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000',
    SITE_URL_ANY2K: 'https://mercysystems.com/4k',
    SMTP_HOST: 'smtp.invalid',
    SMTP_FROM: 'Mercy Systems <licenses@example.test>',
    PRODUCT_VERSION: '1.0.0',
    ...overrides,
  });
  return cfg;
}

function fakeKeygen({ now }) {
  const licenses = new Map();
  const calls = [];
  let n = 0;
  return {
    licenses, calls,
    async createLicense({ policyId, name, expiry, maxMachines, metadata }) {
      calls.push(['create', policyId]);
      n += 1;
      const id = crypto.randomUUID();
      let exp = expiry || null;
      if (!exp && policyId === 'pol-trial') exp = new Date(now() + 14 * 86400 * 1000).toISOString();
      const lic = { id, key: `TEST-KEY-${String(n).padStart(4, '0')}-${id.slice(0, 6).toUpperCase()}`, expiry: exp, suspended: false, metadata: { ...metadata }, policyId, name, maxMachines };
      licenses.set(id, lic);
      return { ...lic };
    },
    async findLicensesByMetadata(meta) {
      calls.push(['find']);
      return [...licenses.values()].filter((l) => Object.entries(meta).every(([k, v]) => String(l.metadata[k]) === String(v))).map((l) => ({ ...l }));
    },
    async setExpiry(id, expiry) { calls.push(['expiry', id, expiry]); licenses.get(id).expiry = expiry; return { ...licenses.get(id) }; },
    async suspend(id) { calls.push(['suspend', id]); licenses.get(id).suspended = true; },
    async reinstate(id) { calls.push(['reinstate', id]); licenses.get(id).suspended = false; },
    async revoke(id) { calls.push(['revoke', id]); licenses.delete(id); },
  };
}

function fakeStripe() {
  const sessions = new Map();
  const subscriptions = new Map();
  const customers = new Map();
  const invoicePaymentsByPi = new Map();
  const created = [];
  const metadataWrites = [];
  return {
    sessions, customers, invoicePaymentsByPi, created, metadataWrites,
    webhooks: realStripe.webhooks,
    checkout: {
      sessions: {
        async create(params) {
          const id = `cs_test_${crypto.randomBytes(12).toString('hex')}`;
          created.push(params);
          return { id, url: `https://checkout.stripe.test/c/pay/${id}` };
        },
        async retrieve(id) {
          const s = sessions.get(id);
          if (!s) { const e = new Error('No such checkout.session'); e.statusCode = 404; throw e; }
          return JSON.parse(JSON.stringify(s));
        },
      },
    },
    subscriptions: {
      set: (id, v) => subscriptions.set(id, v),
      async retrieve(id) { return subscriptions.get(id); },
      async update(id, params) {
        metadataWrites.push(['subscription', id, params.metadata || {}]);
        const cur = subscriptions.get(id) || { id };
        cur.metadata = { ...(cur.metadata || {}), ...(params.metadata || {}) };
        subscriptions.set(id, cur);
        return cur;
      },
    },
    customers: {
      async update(id, params) {
        metadataWrites.push(['customer', id, params.metadata || {}]);
        const cur = customers.get(id) || { id };
        cur.metadata = { ...(cur.metadata || {}), ...(params.metadata || {}) };
        customers.set(id, cur);
        return cur;
      },
    },
    invoicePayments: {
      async list({ payment }) {
        const inv = invoicePaymentsByPi.get(payment.payment_intent);
        return { data: inv ? [{ invoice: inv }] : [] };
      },
    },
    invoices: { async retrieve() { return null; } },
  };
}

function addPaidSession(stripe, { id, plan, seats = 1, email = 'buyer@supplier.example', subscription = null, paymentIntent = null, customer = 'cus_test_1', metadata = {}, paymentStatus = 'paid', created, priceId = null }) {
  const price = priceId || `price_${plan}_test`;
  const s = {
    id, object: 'checkout.session', livemode: false, created: created || Math.floor(Date.now() / 1000),
    mode: plan === 'perpetual' ? 'payment' : 'subscription',
    payment_status: paymentStatus, status: 'complete',
    customer, subscription, payment_intent: paymentIntent,
    customer_details: { email, name: 'Test Buyer' },
    metadata: { product: 'AMCDT', plan, seats: String(seats), license_agreement_version: '1.0', agreed_at: '2026-10-21T00:00:00.000Z', ...metadata },
    line_items: { data: [{ quantity: seats, price: { id: price } }] },
  };
  stripe.sessions.set(id, s);
  return s;
}

async function startApp(opts = {}) {
  let clock = opts.startMs || Date.parse('2026-10-21T12:00:00Z');
  const now = () => clock;
  const config = makeConfig(opts.env);
  const db = openDb(':memory:');
  const stripe = fakeStripe();
  const keygen = fakeKeygen({ now });
  const mails = [];
  const mailer = { async send(m) { if (opts.mailFails) throw new Error('smtp down'); mails.push(m); } };
  const quiet = { log() {}, warn() {}, error() {} };
  const app = createApp({ config, db, stripe, keygen, mailer, now, log: quiet });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function sendEvent(type, object, { id, secret = WEBHOOK_SECRET, tamper = false, header } = {}) {
    const event = { id: id || `evt_${crypto.randomBytes(8).toString('hex')}`, object: 'event', type, data: { object }, created: Math.floor(clock / 1000) };
    const payload = JSON.stringify(event);
    const sig = header !== undefined ? header : realStripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(`${base}/api/stripe-webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(sig ? { 'stripe-signature': sig } : {}) },
      body: tamper ? payload.replace('"type"', '"type" ') : payload,
    });
    return { status: res.status, body: await res.json(), eventId: event.id };
  }

  async function post(path, body) {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  async function get(path) {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, body: await res.json() };
  }

  return {
    app, server, base, db, stripe, keygen, mails, config, sendEvent, post, get,
    advance: (ms) => { clock += ms; },
    now,
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { startApp, addPaidSession, WEBHOOK_SECRET, makeConfig };
