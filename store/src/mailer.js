'use strict';
const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

/** Build the license email (subject, text, html). Pure function - easy to test. */
function buildLicenseEmail({ purchase, licenses, siteUrl, productVersion, supportEmail = 'danny@mercysystems.com' }) {
  const PLAN = {
    monthly: ['Monthly subscription ($59/month)', 'Your subscription renews automatically each month until you cancel. If a renewal payment fails you have a 14-day grace period to update your payment details.'],
    annual: ['Annual subscription ($590/year)', 'Your subscription renews automatically each year until you cancel. If a renewal payment fails you have a 14-day grace period to update your payment details.'],
    perpetual: ['One-time perpetual license ($1,490)', 'Your perpetual license includes updates and email support for 12 months from purchase.'],
  };
  const [planLabel, planNote] = PLAN[purchase.plan] || PLAN.perpetual;
  const label = (l) => (licenses.length > 1 ? `Seat ${l.seat_index}: ` : '');
  const keysText = licenses.map((l) => `  ${label(l)}${l.license_key}`).join('\n') + '\n';
  const keysHtml = licenses.map((l) =>
    `<p style="margin:4px 0;font-family:Consolas,Menlo,monospace;background:#000;border:1px solid #3a3220;padding:8px;color:#f0d77a;word-break:break-all;">${escapeHtml(label(l))}${escapeHtml(l.license_key)}</p>`).join('\n');

  const common = {
    PLAN_LABEL: planLabel,
    SEATS: String(purchase.seats),
    AGREEMENT_VERSION: purchase.agreement_version || '',
    DOWNLOAD_PAGE: `${siteUrl}/download.html`,
    LICENSE_URL: `${siteUrl}/license.html`,
    PRIVACY_URL: `${siteUrl}/privacy.html`,
    MANAGE_URL: `${siteUrl}/manage.html`,
    SUPPORT_EMAIL: supportEmail,
    VERSION: productVersion,
  };
  const text = fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'license-email.txt'), 'utf8'), {
    ...common, NAME: purchase.customer_name || 'there', KEYS_TEXT: keysText, PLAN_NOTE: planNote,
  });
  const html = fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'license-email.html'), 'utf8'), {
    ...Object.fromEntries(Object.entries(common).map(([k, v]) => [k, escapeHtml(v)])),
    NAME: escapeHtml(purchase.customer_name || 'there'), KEYS_HTML: keysHtml, PLAN_NOTE: escapeHtml(planNote),
  });
  return { subject: 'Your AMCDT license key - Mercy Systems', text, html };
}

/** Build the trial email. Pure function. */
function buildTrialEmail({ trial, siteUrl, productVersion, trialDays = 14, supportEmail = 'danny@mercysystems.com' }) {
  const end = trial.expiry ? new Date(trial.expiry).toUTCString().replace(/:\d\d GMT$/, ' UTC') : `${trialDays} days after this email`;
  const vars = {
    TRIAL_KEY: trial.license_key,
    TRIAL_END: end,
    TRIAL_DAYS: String(trialDays),
    DOWNLOAD_PAGE: `${siteUrl}/download.html`,
    LICENSE_URL: `${siteUrl}/license.html`,
    PRIVACY_URL: `${siteUrl}/privacy.html`,
    SUPPORT_EMAIL: supportEmail,
    BUY_URL: `${siteUrl}/buy?trial=${encodeURIComponent(trial.keygen_id)}`,
    VERSION: productVersion || '[VERSION]',
    AGREEMENT_VERSION: trial.agreement_version || '',
  };
  const text = fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'trial-email.txt'), 'utf8'), vars);
  const html = fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'trial-email.html'), 'utf8'),
    Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)])));
  return { subject: `Your ${trialDays}-day AMCDT trial key - Mercy Systems`, text, html };
}

/** Real SMTP mailer (nodemailer). Tests inject a fake { send } instead. */
function createSmtpMailer(smtp) {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({
        from: smtp.from, to, subject, text, html,
        replyTo: smtp.replyTo || undefined,
        bcc: smtp.bcc || undefined,
      });
    },
  };
}

module.exports = { buildLicenseEmail, buildTrialEmail, createSmtpMailer, escapeHtml };
