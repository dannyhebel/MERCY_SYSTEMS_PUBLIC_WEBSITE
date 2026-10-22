'use strict';
const express = require('express');
const { rateLimit } = require('./rateLimit');
const { createFulfillment } = require('./fulfillment');
const { createTrials } = require('./trials');

const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const DOWNLOAD_FILE_RE = /^amcdt_\d+\.\d+\.\d+_(amd64|arm64)\.deb(\.sha256)?$/;
const TRIAL_ID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Build the Express app. Every external dependency is injected:
 *   deps = { config, db, stripe, keygen, mailer, now?, log? }
 */
function createApp(deps) {
  const { config, db, stripe, log = console } = deps;
  const fulfillment = createFulfillment(deps);
  const trials = createTrials(deps);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Rate-limit key: the real visitor IP. Behind DigitalOcean App Platform the edge puts it in
  // the do-connecting-ip header (CLIENT_IP_HEADER); otherwise use Express' req.ip.
  const clientKey = (req) => {
    if (config.clientIpHeader) {
      const v = req.get(config.clientIpHeader);
      if (v) return String(v).split(',')[0].trim().slice(0, 64);
    }
    return req.ip;
  };
  const limit = (windowMs, max) => rateLimit({ windowMs, max, keyFn: clientKey });

  const noStore = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
  app.use('/api', noStore);

  // ---- Stripe webhook: needs the RAW body for signature verification -----
  app.post('/api/stripe-webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const sig = req.get('stripe-signature');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } catch (err) {
      log.warn?.(`[webhook] signature check failed: ${err.message}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }
    try {
      const result = await fulfillment.handleEvent(event);
      return res.json({ received: true, ...result });
    } catch (err) {
      log.error?.(`[webhook] ${event.type} ${event.id} failed: ${err.message}`);
      return res.status(500).json({ error: 'Handler failed; Stripe will retry' });
    }
  });

  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // ---- Create Checkout Session ------------------------------------------
  app.post('/api/create-checkout-session',
    limit(config.rateLimit.checkoutWindowMs, config.rateLimit.checkoutMax),
    async (req, res) => {
      const { plan, agreed } = req.body || {};
      if (agreed !== true) return res.status(400).json({ error: 'Please accept the License Agreement before checkout.' });
      if (!['monthly', 'annual', 'perpetual'].includes(plan)) return res.status(400).json({ error: 'Unknown plan.' });
      // Each purchase is exactly one license (one seat): quantity is always 1.
      if (req.body?.seats !== undefined && Number(req.body.seats) !== 1) {
        return res.status(400).json({ error: 'Each purchase is for one license. Please buy again for another seat.' });
      }
      const seats = 1;
      let trial = null;
      const trialId = req.body?.trial_license_id;
      if (trialId) {
        if (!TRIAL_ID_RE.test(String(trialId))) return res.status(400).json({ error: 'Invalid trial reference.' });
        trial = await trials.trialByLicenseId(String(trialId)); // unknown id -> just ignore, still allow purchase
      }

      const mode = plan === 'perpetual' ? 'payment' : 'subscription';
      const price = { monthly: config.stripe.priceMonthly, annual: config.stripe.priceAnnual, perpetual: config.stripe.pricePerpetual }[plan];
      const agreedAt = new Date(deps.now ? deps.now() : Date.now()).toISOString();
      const metadata = {
        product: 'AMCDT',
        plan,
        seats: String(seats),
        license_agreement_version: config.licenseAgreementVersion,
        agreed_at: agreedAt,
        ...(trial ? { trial_license_id: trial.keygen_id } : {}),
      };
      const params = {
        mode,
        line_items: [{ price, quantity: 1 }], // fixed quantity, no adjustable_quantity
        success_url: `${config.siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.siteUrl}/cancel.html`,
        metadata,
        billing_address_collection: 'required',
        ...(config.stripe.taxIdCollection ? { tax_id_collection: { enabled: true } } : {}),
        ...(config.stripe.automaticTax ? { automatic_tax: { enabled: true } } : {}),
        ...(config.stripe.allowPromotionCodes ? { allow_promotion_codes: true } : {}),
        ...(trial ? { customer_email: trial.email } : {}),
      };
      if (mode === 'subscription') {
        params.subscription_data = { metadata };
      } else {
        params.customer_creation = 'always';
        params.payment_intent_data = { metadata };
      }
      try {
        const session = await stripe.checkout.sessions.create(params);
        db.prepare(`INSERT OR IGNORE INTO checkout_requests (session_id, plan, seats, agreement_version, agreed_at, trial_license_id, user_agent, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(session.id, plan, seats, config.licenseAgreementVersion, agreedAt,
          trial ? trial.keygen_id : null, String(req.get('user-agent') || '').slice(0, 300), Math.floor(Date.now() / 1000));
        return res.json({ url: session.url });
      } catch (err) {
        log.error?.(`[checkout] create failed: ${err.message}`);
        return res.status(502).json({ error: 'Could not start checkout. Please try again in a moment.' });
      }
    });

  // ---- License key(s) for the success page -------------------------------
  app.get('/api/license',
    limit(config.rateLimit.licenseWindowMs, config.rateLimit.licenseMax),
    async (req, res) => {
      const sessionId = String(req.query.session_id || '');
      if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ status: 'invalid', error: 'Missing or invalid session_id.' });
      try {
        const r = await fulfillment.fulfillCheckout(sessionId);
        if (r.status === 'unpaid') return res.status(402).json({ status: 'unpaid', error: 'Payment not completed for this checkout.' });
        if (r.status === 'ignored') return res.status(404).json({ status: 'not_found' });
        if (r.status === 'pending') return res.status(202).json({ status: 'pending' });
        const p = r.purchase;
        const ageDays = (Math.floor((deps.now ? deps.now() : Date.now()) / 1000) - (p.session_created || p.created_at)) / 86400;
        if (ageDays > config.licensePageMaxAgeDays) {
          return res.status(410).json({ status: 'expired_link', error: 'For security, keys are only shown here for a few days after purchase. Please check your email.' });
        }
        return res.json({
          status: 'ready',
          plan: p.plan,
          seats: p.seats,
          emailed: !!p.emailed_at,
          email: maskEmail(p.customer_email),
          licenses: r.licenses.map((l) => ({ seat: l.seat, key: l.key, expiry: p.plan === 'perpetual' ? null : l.expiry })),
        });
      } catch (err) {
        log.error?.(`[license] ${sessionId}: ${err.message}`);
        return res.status(503).json({ status: 'pending', error: 'Still preparing your keys. Retrying...' });
      }
    });

  // ---- Manage subscription: Stripe customer portal ------------------------
  // The customer proves ownership with BOTH the checkout email and one of their license keys.
  // Unknown or mismatching pairs get the same answer (no account probing); rate limited.
  app.post('/api/billing-portal',
    limit(config.rateLimit.portalWindowMs, config.rateLimit.portalMax),
    async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const key = String(req.body?.license_key || '').trim();
      const fallback = config.stripe.portalLoginUrl || null;
      const notFound = () => res.status(404).json({
        error: `We could not find a purchase for that email address and license key. Check both, or email ${config.supportEmail}.`,
        portal_login_url: fallback,
      });
      if (!email || email.length > 254 || !email.includes('@') || !key || key.length > 200) return notFound();
      let row = db.prepare(`SELECT p.customer_id, p.customer_email FROM licenses l JOIN purchases p ON p.session_id = l.session_id
        WHERE l.license_key = ?`).get(key);
      if (!row && deps.keygen && deps.keygen.getLicense) {
        // Not in the local cache (fresh disk after a restart): ask Keygen, the source of truth.
        try {
          const lic = await deps.keygen.getLicense(key);
          if (lic && lic.key === key && lic.metadata && lic.metadata.kind === 'paid') {
            row = { customer_id: lic.metadata.stripeCustomerId || null, customer_email: lic.metadata.email || '' };
          }
        } catch (err) {
          log.error?.(`[portal] license lookup failed: ${err.message}`);
        }
      }
      if (!row || !row.customer_id || String(row.customer_email || '').trim().toLowerCase() !== email) return notFound();
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: row.customer_id,
          return_url: `${config.siteUrl}/manage.html`,
          ...(config.stripe.portalConfigurationId ? { configuration: config.stripe.portalConfigurationId } : {}),
        });
        return res.json({ url: session.url });
      } catch (err) {
        log.error?.(`[portal] create failed: ${err.message}`);
        return res.status(502).json({ error: `Could not open the billing portal right now. Please try again later or email ${config.supportEmail}.`, portal_login_url: fallback });
      }
    });

  // ---- Free trial --------------------------------------------------------
  app.post('/api/trial',
    limit(config.rateLimit.trialWindowMs, config.rateLimit.trialMax),
    async (req, res) => {
      try {
        const r = await trials.requestTrial({ email: req.body?.email, agreed: req.body?.agreed });
        if (!r.ok) return res.status(r.code === 'disabled' ? 503 : 400).json({ error: r.message, code: r.code });
        return res.json({ ok: true, message: 'Check your inbox: your trial key is on its way. If you already started a trial with this address, we have re-sent your existing key.' });
      } catch (err) {
        log.error?.(`[trial] failed: ${err.message}`);
        return res.status(503).json({ error: 'We could not start your trial right now. Please try again in a few minutes.' });
      }
    });

  // ---- "/amcdt/buy?trial=..." (link used by the AMCDT app and the trial email) -> buy.html
  // Static hosting does not map /amcdt/buy to buy.html, so the store answers this one path.
  app.get('/amcdt/buy', (req, res) => {
    const i = req.originalUrl.indexOf('?');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, `/amcdt/buy.html${i >= 0 ? req.originalUrl.slice(i) : ''}`);
  });

  // ---- /downloads/<file>: public installer links -> the real file host (DOWNLOAD_BASE_URL)
  if (config.downloadBaseUrl && !config.serveDownloadsDir) {
    app.get('/downloads/:file', (req, res) => {
      const file = String(req.params.file || '');
      if (!DOWNLOAD_FILE_RE.test(file)) return res.status(404).type('text/plain').send('Not found');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.redirect(302, `${config.downloadBaseUrl}/${file}`);
    });
  }

  if (config.serveStaticDir) {
    // Local development only; in production App Platform serves the static site.
    app.use('/amcdt', express.static(config.serveStaticDir, { extensions: ['html'] }));
    if (config.serveDownloadsDir) app.use('/downloads', express.static(config.serveDownloadsDir));
    app.get('/', (req, res) => res.redirect('/amcdt/'));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.locals.fulfillment = fulfillment;
  app.locals.trials = trials;
  return app;
}

function maskEmail(e) {
  if (!e) return null;
  const [u, d] = String(e).split('@');
  if (!d) return null;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

module.exports = { createApp, maskEmail };
