'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS purchases (
  session_id         TEXT PRIMARY KEY,
  plan               TEXT NOT NULL,          -- annual | perpetual
  seats              INTEGER NOT NULL,
  customer_id        TEXT,
  customer_email     TEXT,
  customer_name      TEXT,
  subscription_id    TEXT,
  payment_intent_id  TEXT,
  agreement_version  TEXT,
  agreed_at          TEXT,
  trial_license_id   TEXT,                               -- Keygen id of the trial this purchase converted
  livemode           INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'processing', -- processing | fulfilled
  access             TEXT NOT NULL DEFAULT 'active',     -- active | suspended | revoked
  access_reason      TEXT,                               -- payment_failed | subscription_ended | refund | dispute
  grace_until        INTEGER,                            -- unix seconds; set on first failed renewal
  lock_at            INTEGER,
  emailed_at         INTEGER,
  email_attempts     INTEGER NOT NULL DEFAULT 0,
  session_created    INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_sub ON purchases(subscription_id);
CREATE INDEX IF NOT EXISTS idx_purchases_pi ON purchases(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases(customer_id);

CREATE TABLE IF NOT EXISTS licenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES purchases(session_id),
  seat_index   INTEGER NOT NULL,
  keygen_id    TEXT NOT NULL UNIQUE,
  license_key  TEXT NOT NULL,
  expiry       TEXT,
  state        TEXT NOT NULL DEFAULT 'active',   -- active | suspended | revoked
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (session_id, seat_index)
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trials (
  email_norm           TEXT PRIMARY KEY,                 -- one trial per (normalised) email
  email                TEXT NOT NULL,
  keygen_id            TEXT UNIQUE,
  license_key          TEXT,
  expiry               TEXT,
  agreement_version    TEXT,
  status               TEXT NOT NULL DEFAULT 'processing', -- processing | issued
  sends                INTEGER NOT NULL DEFAULT 0,
  last_sent_at         INTEGER,
  converted_session_id TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkout_requests (
  session_id         TEXT PRIMARY KEY,
  plan               TEXT NOT NULL,
  seats              INTEGER NOT NULL,
  agreement_version  TEXT NOT NULL,
  agreed_at          TEXT NOT NULL,
  trial_license_id   TEXT,
  user_agent         TEXT,
  created_at         INTEGER NOT NULL
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
