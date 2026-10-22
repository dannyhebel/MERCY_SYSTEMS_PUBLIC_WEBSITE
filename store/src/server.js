'use strict';
/** Production entry point: `node src/server.js` (`npm start`; run by DigitalOcean App Platform). */
const path = require('path');
const Stripe = require('stripe');
const { loadConfig, missingRequired } = require('./config');
const { openDb } = require('./db');
const { createKeygenClient } = require('./keygen');
const { createSmtpMailer } = require('./mailer');
const { createApp } = require('./app');

const config = loadConfig();
const missing = missingRequired(config);
if (missing.length) {
  console.error(`Missing required settings: ${missing.join(', ')}. See .env.example.`);
  process.exit(1);
}

// The SDK pins the Stripe API version it was built for; keep the webhook
// endpoint in the Stripe Dashboard on the same version (see README).
const stripe = new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2 });
const db = openDb(path.resolve(config.databasePath));
const keygen = createKeygenClient(config.keygen);
const mailer = createSmtpMailer(config.smtp);

const app = createApp({ config, db, stripe, keygen, mailer });

app.listen(config.port, config.host, () => {
  console.log(`AMCDT store backend listening on http://${config.host}:${config.port} (${config.stripe.secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'} mode)`);
});

// Graceful stop on redeploy (App Platform sends SIGTERM).
process.on('SIGTERM', () => { try { db.close(); } catch {} process.exit(0); });

// Hourly: suspend annual licences whose 14-day payment grace has ended.
const sweep = () => app.locals.fulfillment.runGraceSweep()
  .then((n) => n && console.log(`[grace] suspended ${n} purchase(s)`))
  .catch((e) => console.error(`[grace] ${e.message}`));
setInterval(sweep, 60 * 60 * 1000).unref();
setTimeout(sweep, 10 * 1000).unref();
