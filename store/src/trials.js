'use strict';
/**
 * 14-day free trial: email in -> trial key out, by email only.
 *
 * Why email-only (key is never shown on screen): sending the key to the
 * address is what proves the address is real and belongs to the requester.
 * Showing it on screen would let anyone type any address (or a throwaway) and
 * get a key instantly, which defeats "one trial per email".
 */
const crypto = require('crypto');

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Small built-in list of throwaway-mail domains. Extend with TRIAL_BLOCKED_DOMAINS.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'trashmail.com', 'yopmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
]);
const FREE_WEBMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com',
  'icloud.com', 'me.com', 'gmx.com', 'gmx.de', 'web.de', 'proton.me', 'protonmail.com', 'mail.com', 'yandex.com',
]);

/** lower-case, trim, drop "+tag" so a+1@x.com and a+2@x.com count as one trial. */
function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

function checkEmail(email, trialCfg) {
  const e = String(email || '').trim();
  if (e.length > 254 || !EMAIL_RE.test(e)) return 'Please enter a valid email address.';
  const domain = e.split('@').pop().toLowerCase();
  if (DISPOSABLE.has(domain) || trialCfg.extraBlockedDomains.includes(domain)) {
    return 'Please use your work email address. Disposable email addresses cannot be used for a trial.';
  }
  if (trialCfg.blockFreeWebmail && FREE_WEBMAIL.has(domain)) {
    return 'Please use your work (company) email address for the trial.';
  }
  return null;
}

function createTrials({ db, keygen, mailer, config, now = () => Date.now(), log = console }) {
  const nowSec = () => Math.floor(now() / 1000);
  const q = {
    get: db.prepare('SELECT * FROM trials WHERE email_norm = ?'),
    getByKeygenId: db.prepare('SELECT * FROM trials WHERE keygen_id = ?'),
    insert: db.prepare(`INSERT OR IGNORE INTO trials (email_norm, email, agreement_version, status, created_at, updated_at)
      VALUES (?, ?, ?, 'processing', ?, ?)`),
    claim: db.prepare(`UPDATE trials SET updated_at = ? WHERE email_norm = ? AND status = 'processing' AND updated_at < ?`),
    issued: db.prepare(`UPDATE trials SET keygen_id = ?, license_key = ?, expiry = ?, status = 'issued', updated_at = ? WHERE email_norm = ?`),
    sent: db.prepare('UPDATE trials SET sends = sends + 1, last_sent_at = ?, updated_at = ? WHERE email_norm = ?'),
    setEmail: db.prepare('UPDATE trials SET email = ? WHERE email_norm = ?'),
  };

  async function sendTrialEmail(trial) {
    const { buildTrialEmail } = require('./mailer');
    const msg = buildTrialEmail({ trial, siteUrl: config.siteUrl, productVersion: config.productVersion, trialDays: config.trial.days, supportEmail: config.supportEmail });
    await mailer.send({ to: trial.email, ...msg });
    q.sent.run(nowSec(), nowSec(), trial.email_norm);
  }

  /**
   * @returns {Promise<{ok: boolean, code: string, message?: string}>}
   * Response is deliberately the same whether the address is new or already
   * had a trial (we re-send the existing key), so the endpoint cannot be used
   * to discover who has tried AMCDT.
   */
  async function requestTrial({ email, agreed }) {
    if (!config.trial.enabled) return { ok: false, code: 'disabled', message: 'Free trials are not available right now.' };
    if (agreed !== true) return { ok: false, code: 'agreement_required', message: 'Please accept the License Agreement to start a trial.' };
    const problem = checkEmail(email, config.trial);
    if (problem) return { ok: false, code: 'invalid_email', message: problem };

    const clean = String(email).trim();
    const norm = normalizeEmail(clean);
    const t = nowSec();
    q.insert.run(norm, clean, config.licenseAgreementVersion, t - 3600, t - 3600); // backdated so the claim below succeeds once
    let trial = q.get.get(norm);

    if (trial.status === 'issued') {
      // One trial per email: re-send the same key, with a cooldown and cap.
      const cooled = !trial.last_sent_at || t - trial.last_sent_at >= config.trial.resendCooldownSec;
      if (trial.sends < 1 + config.trial.maxResends && cooled) {
        try { await sendTrialEmail(trial); } catch (e) { log.error?.(`[trial] resend failed: ${e.message}`); }
      }
      return { ok: true, code: 'sent' };
    }

    // status = processing: claim it (stale claims older than 2 min can be retaken).
    const claimed = q.claim.run(t, norm, t - 120);
    if (claimed.changes === 0) return { ok: true, code: 'sent' }; // a parallel request is issuing it

    try {
      const found = await keygen.findLicensesByMetadata({ trialEmail: norm });
      const lic = found[0] || await keygen.createLicense({
        policyId: config.keygen.policyTrial,
        name: `AMCDT trial - ${norm}`,
        maxMachines: 1,
        // expiry left to the trial policy (duration 1209600 s = 14 days)
        metadata: { trialEmail: norm, email: clean, licenseAgreementVersion: config.licenseAgreementVersion, kind: 'trial' },
      });
      q.issued.run(lic.id, lic.key, lic.expiry, nowSec(), norm);
      // Rebuilt from Keygen after a restart: keep the address the trial was first issued to.
      if (found[0] && found[0].metadata && found[0].metadata.email) q.setEmail.run(found[0].metadata.email, norm);
    } catch (e) {
      q.claim.run(0, norm, Number.MAX_SAFE_INTEGER); // release claim (updated_at=0)
      throw e;
    }
    trial = q.get.get(norm);
    try { await sendTrialEmail(trial); } catch (e) { log.error?.(`[trial] email failed for new trial: ${e.message}`); }
    return { ok: true, code: 'sent' };
  }

  /**
   * Used by the buy page / checkout to pre-fill the trial user's email.
   * Falls back to Keygen when the local record is gone (fresh disk after a restart).
   */
  async function trialByLicenseId(licenseId) {
    if (!licenseId || !/^[0-9a-f-]{36}$/i.test(licenseId)) return null;
    const local = q.getByKeygenId.get(licenseId.toLowerCase());
    if (local) return local;
    if (!keygen.getLicense) return null;
    try {
      const lic = await keygen.getLicense(licenseId.toLowerCase());
      if (!lic || !lic.metadata || lic.metadata.kind !== 'trial' || !lic.metadata.email) return null;
      return { keygen_id: lic.id, email: lic.metadata.email };
    } catch (e) {
      log.warn?.(`[trial] lookup of trial ${licenseId} failed: ${e.message}`);
      return null;
    }
  }

  return { requestTrial, trialByLicenseId };
}

module.exports = { createTrials, normalizeEmail, checkEmail, hashForLog: (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12) };
