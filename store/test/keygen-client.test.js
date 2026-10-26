'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeygenClient } = require('../src/keygen');

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const r = responses.shift() || { status: 200, json: { data: null } };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.json };
  };
  fn.calls = calls;
  return fn;
}

const cfg = { apiUrl: 'https://license.example.test', accountId: 'acct-1', adminToken: 'tok' };

test('createLicense sends a JSON:API request to /v1/accounts/{account}/licenses', async () => {
  const f = mockFetch([{ status: 201, json: { data: { id: 'lic-1', type: 'licenses', attributes: { key: 'K-1', expiry: null } } } }]);
  const kg = createKeygenClient({ ...cfg, fetchImpl: f });
  const lic = await kg.createLicense({ policyId: 'pol-1', name: 'n', maxMachines: 1, metadata: { seatIndex: '1' } });
  assert.deepEqual(lic, { id: 'lic-1', key: 'K-1', expiry: null, suspended: false, metadata: {} });
  const c = f.calls[0];
  assert.equal(c.url, 'https://license.example.test/v1/accounts/acct-1/licenses');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers['Content-Type'], 'application/vnd.api+json');
  assert.equal(c.init.headers.Accept, 'application/vnd.api+json');
  assert.equal(c.init.headers.Authorization, 'Bearer tok');
  assert.equal(c.init.headers['Keygen-Version'], '1.8');
  assert.deepEqual(c.body, {
    data: {
      type: 'licenses',
      attributes: { name: 'n', maxMachines: 1, metadata: { seatIndex: '1' } },
      relationships: { policy: { data: { type: 'policies', id: 'pol-1' } } },
    },
  });
});

test('expiry, metadata search, suspend, reinstate, revoke use the documented endpoints', async () => {
  const lic = { data: { id: 'lic-1', type: 'licenses', attributes: { key: 'K' } } };
  const f = mockFetch([{ status: 200, json: lic }, { status: 200, json: { data: [] } }, { status: 200, json: lic }, { status: 200, json: lic }, { status: 204 }]);
  const kg = createKeygenClient({ ...cfg, fetchImpl: f });
  await kg.setExpiry('lic-1', '2027-01-01T00:00:00.000Z');
  await kg.findLicensesByMetadata({ stripeSessionId: 'cs_1', seatIndex: '2' });
  await kg.suspend('lic-1');
  await kg.reinstate('lic-1');
  await kg.revoke('lic-1');
  const m = f.calls.map((c) => `${c.init.method} ${c.url.replace('https://license.example.test/v1/accounts/acct-1', '')}`);
  assert.deepEqual(m, [
    'PATCH /licenses/lic-1',
    'GET /licenses?limit=100&metadata[stripeSessionId]=cs_1&metadata[seatIndex]=2',
    'POST /licenses/lic-1/actions/suspend',
    'POST /licenses/lic-1/actions/reinstate',
    'DELETE /licenses/lic-1/actions/revoke',
  ]);
  assert.deepEqual(f.calls[0].body, { data: { type: 'licenses', attributes: { expiry: '2027-01-01T00:00:00.000Z' } } });
});

test('errors carry status and Keygen error detail', async () => {
  const f = mockFetch([{ status: 422, json: { errors: [{ title: 'Unprocessable', detail: 'policy not found' }] } }]);
  const kg = createKeygenClient({ ...cfg, fetchImpl: f });
  await assert.rejects(kg.createLicense({ policyId: 'x' }), (e) => e.status === 422 && /policy not found/.test(e.message));
});
