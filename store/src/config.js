'use strict';
/**
 * Reads all configuration from environment variables.
 * Nothing secret is ever hard-coded here. On DigitalOcean App Platform the values are
 * set as environment variables in the app settings (see DEPLOY-APP-PLATFORM.md).
 */

function bool(v, dflt = false) {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

function parseTrustProxy(v) {
  if (v === undefined || v === '') return 'loopback';
  if (['true', 'false'].includes(String(v).toLowerCase())) return String(v).toLowerCase() === 'true';
  if (/^\d+$/.test(String(v))) return parseInt(v, 10);
  return v;
}

function loadConfig(env = process.env) {
  const cfg = {
    port: int(env.PORT, 3005),
    host: env.HOST || '127.0.0.1',
    siteUrl: (env.SITE_URL || 'http://localhost:3005/amcdt').replace(/\/+$/, ''),
    downloadUrl: env.DOWNLOAD_URL || '',
    // Where the .deb installers really live (GitHub Release or Spaces folder, no trailing slash).
    // /downloads/<file> on the website redirects there. Empty = /downloads/ is not handled by the store.
    downloadBaseUrl: (env.DOWNLOAD_BASE_URL || '').replace(/\/+$/, ''),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    // Header that carries the real visitor IP (DigitalOcean App Platform: do-connecting-ip).
    // Used only for rate limiting. Empty = use the Express request IP.
    clientIpHeader: (env.CLIENT_IP_HEADER || '').toLowerCase(),
    databasePath: env.DATABASE_PATH || './data/amcdt-store.sqlite',

    productVersion: env.PRODUCT_VERSION || '[VERSION]',
    licenseAgreementVersion: env.LICENSE_AGREEMENT_VERSION || '1.0',
    // Each purchase = one license (one seat). Kept configurable only as a safety cap.
    maxSeats: int(env.MAX_SEATS, 1),
    graceDays: int(env.GRACE_DAYS, 14),
    refundAction: (env.REFUND_ACTION || 'suspend').toLowerCase(), // suspend | revoke
    licensePageMaxAgeDays: int(env.LICENSE_PAGE_MAX_AGE_DAYS, 7),
    supportEmail: env.SUPPORT_EMAIL || 'danny@mercysystems.com',

    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
      priceMonthly: env.STRIPE_PRICE_MONTHLY || '',
      priceAnnual: env.STRIPE_PRICE_ANNUAL || '',
      pricePerpetual: env.STRIPE_PRICE_PERPETUAL || '',
      automaticTax: bool(env.STRIPE_AUTOMATIC_TAX, false),
      taxIdCollection: bool(env.STRIPE_TAX_ID_COLLECTION, true),
      allowPromotionCodes: bool(env.STRIPE_ALLOW_PROMOTION_CODES, false),
      // Optional: Stripe's no-code customer portal login link (Dashboard > Settings > Billing >
      // Customer portal > "Login link", https://billing.stripe.com/p/login/...). Offered on the
      // manage page as the email sign-in route; the API route below works without it.
      portalLoginUrl: env.STRIPE_PORTAL_LOGIN_URL || '',
      portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID || '',
    },

    keygen: {
      apiUrl: (env.KEYGEN_API_URL || 'https://api.keygen.sh').replace(/\/+$/, ''),
      accountId: env.KEYGEN_ACCOUNT_ID || '',
      adminToken: env.KEYGEN_ADMIN_TOKEN || '',
      apiVersion: env.KEYGEN_API_VERSION || '1.8',
      policyMonthly: env.KEYGEN_POLICY_MONTHLY || '',
      policyAnnual: env.KEYGEN_POLICY_ANNUAL || '',
      policyPerpetual: env.KEYGEN_POLICY_PERPETUAL || '',
      policyTrial: env.KEYGEN_POLICY_TRIAL || '',
    },

    trial: {
      enabled: bool(env.TRIAL_ENABLED, true),
      days: int(env.TRIAL_DAYS, 14),
      maxResends: int(env.TRIAL_MAX_RESENDS, 3),
      resendCooldownSec: int(env.TRIAL_RESEND_COOLDOWN_SEC, 300),
      blockFreeWebmail: bool(env.TRIAL_BLOCK_FREE_WEBMAIL, false),
      extraBlockedDomains: (env.TRIAL_BLOCKED_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    },

    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 2525),
      secure: bool(env.SMTP_SECURE, false),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || '',
      replyTo: env.SMTP_REPLY_TO || '',
      bcc: env.SMTP_BCC || '',
    },

    rateLimit: {
      licenseWindowMs: int(env.RATE_LIMIT_LICENSE_WINDOW_MS, 10 * 60 * 1000),
      licenseMax: int(env.RATE_LIMIT_LICENSE_MAX, 40),
      checkoutWindowMs: int(env.RATE_LIMIT_CHECKOUT_WINDOW_MS, 10 * 60 * 1000),
      checkoutMax: int(env.RATE_LIMIT_CHECKOUT_MAX, 20),
      trialWindowMs: int(env.RATE_LIMIT_TRIAL_WINDOW_MS, 60 * 60 * 1000),
      trialMax: int(env.RATE_LIMIT_TRIAL_MAX, 5),
      portalWindowMs: int(env.RATE_LIMIT_PORTAL_WINDOW_MS, 15 * 60 * 1000),
      portalMax: int(env.RATE_LIMIT_PORTAL_MAX, 10),
    },
  };
  if (!['suspend', 'revoke'].includes(cfg.refundAction)) cfg.refundAction = 'suspend';
  return cfg;
}

/** Returns a list of missing settings that are required in production. */
function missingRequired(cfg) {
  const req = {
    STRIPE_SECRET_KEY: cfg.stripe.secretKey,
    STRIPE_WEBHOOK_SECRET: cfg.stripe.webhookSecret,
    STRIPE_PRICE_MONTHLY: cfg.stripe.priceMonthly,
    STRIPE_PRICE_ANNUAL: cfg.stripe.priceAnnual,
    STRIPE_PRICE_PERPETUAL: cfg.stripe.pricePerpetual,
    KEYGEN_API_URL: cfg.keygen.apiUrl,
    KEYGEN_ACCOUNT_ID: cfg.keygen.accountId,
    KEYGEN_ADMIN_TOKEN: cfg.keygen.adminToken,
    KEYGEN_POLICY_MONTHLY: cfg.keygen.policyMonthly,
    KEYGEN_POLICY_ANNUAL: cfg.keygen.policyAnnual,
    KEYGEN_POLICY_PERPETUAL: cfg.keygen.policyPerpetual,
    ...(cfg.trial.enabled ? { KEYGEN_POLICY_TRIAL: cfg.keygen.policyTrial } : {}),
    SMTP_HOST: cfg.smtp.host,
    SMTP_FROM: cfg.smtp.from,
    SITE_URL: cfg.siteUrl,
  };
  return Object.entries(req).filter(([, v]) => !v).map(([k]) => k);
}

module.exports = { loadConfig, missingRequired };
