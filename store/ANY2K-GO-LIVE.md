# Any Video to 4K unlock-key fulfillment (go-live notes)

This extends the existing `amcdt-store` DigitalOcean App Platform service so the
same Stripe webhook also fulfills Any Video to 4K purchases. AMCDT behaviour is
unchanged (still routed by its own price IDs).

## New environment variables (App Platform → amcdt-store → App-Level / component env)

Add these (non-secret IDs are fine as plain env; secrets stay SECRET type):

| Name | Value |
|---|---|
| `STRIPE_PRICE_ANY2K` | `price_1UUxTQBfrlpQFrU7okVYSnWO` |
| `KEYGEN_POLICY_ANY2K` | `d0aaab52-c7d6-4277-8fdb-f48fae2f41ed` |
| `SITE_URL_ANY2K` | `https://mercysystems.com/4k` |

Already required for AMCDT (must already be set): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, Keygen admin token, Brevo SMTP (`SMTP_HOST=smtp-relay.brevo.com`,
`SMTP_PORT=2525`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_REPLY_TO`).

Optional but recommended: `STRIPE_PORTAL_LOGIN_URL=https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000`

## Stripe Payment Link

- ID: `plink_1UUxblBfrlpQFrU7JwVkft1d`
- URL: `https://buy.stripe.com/5kQfZggFBacC0rT1Rnak000`
- Created **inactive** on purpose. Reactivate in Stripe Dashboard → Payment Links
  only after this store code is deployed with the env vars above.
- Success redirect: `https://mercysystems.com/4k/?subscribed=1`

## Webhook

The live endpoint `https://mercysystems.com/api/stripe-webhook` already listens
for the needed events. No new webhook is required. After deploy, buy once with
your own card, confirm the email key, then cancel/refund and confirm the key
suspends in Keygen.

## Tests

```bash
cd store && npm test
```

Must stay green for AMCDT and Any2K.
