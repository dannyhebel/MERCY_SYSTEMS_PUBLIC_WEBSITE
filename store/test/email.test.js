'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildLicenseEmail, buildTrialEmail, buildAny2kEmail } = require('../src/mailer');

const FORBIDDEN = [/asav/i, /nexus/i, /python/i, /fraction/i, /safety verification/i, /who'?s right/i, /who is right/i];

test('license email contains the key, plan price, and escapes HTML', () => {
  const m = buildLicenseEmail({
    purchase: { plan: 'annual', seats: 1, agreement_version: '1.0', customer_name: '<b>X</b>' },
    licenses: [{ seat_index: 1, license_key: 'AAA-1' }],
    siteUrl: 'https://mercysystems.com/amcdt', productVersion: '1.0.0',
  });
  assert.ok(m.text.includes('AAA-1'));
  assert.ok(m.text.includes('$590/year'));
  assert.ok(m.html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(m.text.includes('sudo apt install ./amcdt_1.0.0_amd64.deb'));
  assert.ok(m.text.includes('https://mercysystems.com/amcdt/download.html'));
});

test('trial email contains key, end date and buy link', () => {
  const m = buildTrialEmail({ trial: { email: 'a@b.c', keygen_id: '11111111-2222-3333-4444-555555555555', license_key: 'TRIAL-1', expiry: '2026-11-04T12:00:00.000Z', agreement_version: '1.0' }, siteUrl: 'https://mercysystems.com/amcdt', productVersion: '1.0.0' });
  assert.ok(m.text.includes('TRIAL-1'));
  assert.ok(m.text.includes('Wed, 04 Nov 2026 12:00 UTC'));
  assert.ok(m.text.includes('https://mercysystems.com/amcdt/buy?trial=11111111-2222-3333-4444-555555555555'));
});

test('AMCDT emails carry the diagnostic-only disclaimer', () => {
  const dir = path.join(__dirname, '..', 'templates');
  for (const f of ['license-email.html', 'license-email.txt', 'trial-email.html', 'trial-email.txt']) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+/g, ' ');
    assert.ok(/diagnostic tool only/i.test(txt) && /ISO 26262/.test(txt) && /tool qualification/.test(txt), f);
  }
});

test('email templates contain no forbidden marketing / implementation terms', () => {
  const dir = path.join(__dirname, '..', 'templates');
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const re of FORBIDDEN) assert.ok(!re.test(txt), `${f} matches ${re}`);
  }
});

test('every email shows the support address, privacy policy; purchase email links the manage page', () => {
  const lic = buildLicenseEmail({
    purchase: { plan: 'monthly', seats: 1, agreement_version: '1.0' },
    licenses: [{ seat_index: 1, license_key: 'AAA-1' }],
    siteUrl: 'https://mercysystems.com/amcdt', productVersion: '1.0.0',
  });
  const tri = buildTrialEmail({ trial: { email: 'a@b.c', keygen_id: '11111111-2222-3333-4444-555555555555', license_key: 'T-1', expiry: null, agreement_version: '1.0' }, siteUrl: 'https://mercysystems.com/amcdt', productVersion: '1.0.0' });
  for (const m of [lic, tri]) {
    for (const body of [m.text, m.html]) {
      assert.ok(body.includes('danny@mercysystems.com'), 'support email');
      assert.ok(body.includes('https://mercysystems.com/amcdt/privacy.html'), 'privacy link');
    }
  }
  assert.ok(lic.text.includes('https://mercysystems.com/amcdt/manage.html'));
  assert.ok(lic.html.includes('https://mercysystems.com/amcdt/manage.html'));
  const custom = buildLicenseEmail({ purchase: { plan: 'perpetual', seats: 1 }, licenses: [{ seat_index: 1, license_key: 'K' }],
    siteUrl: 'https://x.test/amcdt', productVersion: '1.0.0', supportEmail: 'help@x.test' });
  assert.ok(custom.text.includes('help@x.test') && !custom.text.includes('{{'));
});

test('Any Video to 4K email has key, price, steps, manage link; no internals', () => {
  const m = buildAny2kEmail({
    purchase: { plan: 'any2k', seats: 1, customer_name: '<b>X</b>' },
    licenses: [{ seat_index: 1, license_key: 'ANY2K-TEST-KEY-1' }],
  });
  assert.equal(m.subject, 'Your Any Video to 4K unlock key');
  assert.ok(m.text.includes('ANY2K-TEST-KEY-1'));
  assert.ok(m.text.includes('$4.99/month for UNLIMITED 4K videos'));
  assert.ok(m.text.includes('Works on 1 phone + 1 computer'));
  assert.ok(m.text.includes('Paste this unlock key'));
  assert.ok(m.text.includes('https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000'));
  assert.ok(m.html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(!/python/i.test(m.text + m.html));
  assert.ok(!/nexus/i.test(m.text + m.html));
  assert.ok(!/keygen/i.test(m.text + m.html));
  assert.ok(!/stripe/i.test(m.text + m.html) || m.text.includes('billing.stripe.com')); // portal URL is fine
});
