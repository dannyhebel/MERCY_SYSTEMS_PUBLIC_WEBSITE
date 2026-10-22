'use strict';
/**
 * Minimal Keygen API client (JSON:API) for the endpoints this store needs.
 * Docs: https://keygen.sh/docs/api/licenses/
 *
 *   POST   /v1/accounts/{account}/licenses                      create
 *   GET    /v1/accounts/{account}/licenses?metadata[k]=v         list/filter
 *   GET    /v1/accounts/{account}/licenses/{id-or-key}           retrieve one
 *   PATCH  /v1/accounts/{account}/licenses/{id}                  update (expiry)
 *   POST   /v1/accounts/{account}/licenses/{id}/actions/suspend
 *   POST   /v1/accounts/{account}/licenses/{id}/actions/reinstate
 *   DELETE /v1/accounts/{account}/licenses/{id}/actions/revoke   (permanent delete)
 *
 * Mercy Systems uses hosted Keygen Cloud (KEYGEN_API_URL=https://api.keygen.sh),
 * API version 1.8 (sent as the Keygen-Version header). The same account-scoped
 * URLs also work with a self-hosted Keygen server.
 *
 * `fetchImpl` is injectable so tests never touch the network.
 */

class KeygenError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'KeygenError';
    this.status = status;
    this.body = body;
  }
}

function createKeygenClient({ apiUrl, accountId, adminToken, apiVersion = '1.8', fetchImpl = globalThis.fetch }) {
  const base = `${apiUrl}/v1/accounts/${encodeURIComponent(accountId)}`;

  async function request(method, pathAndQuery, body) {
    const res = await fetchImpl(`${base}${pathAndQuery}`, {
      method,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${adminToken}`,
        ...(apiVersion ? { 'Keygen-Version': apiVersion } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const detail = json && json.errors ? json.errors.map((e) => e.detail || e.title).join('; ') : '';
      throw new KeygenError(`Keygen ${method} ${pathAndQuery} failed: ${res.status} ${detail}`, res.status, json);
    }
    return json;
  }

  return {
    /**
     * Create one license (one seat).
     * @param {object} p
     * @param {string} p.policyId
     * @param {string} [p.name]
     * @param {string|null} [p.expiry] ISO-8601; omit for perpetual
     * @param {number} [p.maxMachines]
     * @param {object} [p.metadata]
     */
    async createLicense({ policyId, name, expiry, maxMachines = 1, metadata = {} }) {
      const attributes = { name, maxMachines, metadata };
      if (expiry) attributes.expiry = expiry;
      const json = await request('POST', '/licenses', {
        data: {
          type: 'licenses',
          attributes,
          relationships: { policy: { data: { type: 'policies', id: policyId } } },
        },
      });
      return normalize(json.data);
    },

    /** Find licenses by metadata (used to make creation retry-safe). */
    async findLicensesByMetadata(meta) {
      const qs = Object.entries(meta)
        .map(([k, v]) => `metadata[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`)
        .join('&');
      const json = await request('GET', `/licenses?limit=100&${qs}`);
      return (json.data || []).map(normalize);
    },

    /** One license by id or by key; null if it does not exist. */
    async getLicense(idOrKey) {
      try {
        const json = await request('GET', `/licenses/${encodeURIComponent(idOrKey)}`);
        return normalize(json && json.data);
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    },

    async setExpiry(licenseId, expiry) {
      const json = await request('PATCH', `/licenses/${encodeURIComponent(licenseId)}`, {
        data: { type: 'licenses', attributes: { expiry } },
      });
      return normalize(json.data);
    },

    async suspend(licenseId) {
      try {
        const json = await request('POST', `/licenses/${encodeURIComponent(licenseId)}/actions/suspend`);
        return normalize(json.data);
      } catch (e) {
        // Already suspended is not an error for our purposes.
        if (e.status === 422) return null;
        throw e;
      }
    },

    async reinstate(licenseId) {
      try {
        const json = await request('POST', `/licenses/${encodeURIComponent(licenseId)}/actions/reinstate`);
        return normalize(json.data);
      } catch (e) {
        if (e.status === 422) return null; // not suspended
        throw e;
      }
    },

    /** Permanently deletes the license in Keygen. Cannot be undone. */
    async revoke(licenseId) {
      try {
        await request('DELETE', `/licenses/${encodeURIComponent(licenseId)}/actions/revoke`);
      } catch (e) {
        if (e.status === 404) return; // already gone
        throw e;
      }
    },
  };
}

function normalize(data) {
  if (!data) return null;
  const a = data.attributes || {};
  return {
    id: data.id,
    key: a.key,
    expiry: a.expiry || null,
    suspended: !!a.suspended,
    ...(a.created ? { created: a.created } : {}),
    metadata: a.metadata || {},
  };
}

module.exports = { createKeygenClient, KeygenError };
