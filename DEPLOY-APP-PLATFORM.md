# Putting the new mercysystems.com live on DigitalOcean App Platform

This guide is written for you, Danny, step by step. Allow about 1.5 to 2 hours the first time.
You will click through four websites: **GitHub**, **your email provider**, **Stripe** and **DigitalOcean**.

> **No passwords or secret keys go into GitHub.** This repository is public. The secret values
> (Stripe secret key, Stripe webhook secret, Keygen admin token, email user name and password) are typed
> **only** into DigitalOcean, on the app's settings screen, in Step 6.

---

## What this package contains, and how the site works

| Folder / file | What it is |
|---|---|
| `public/` | The website: the new homepage at `/`, and the AMCDT pages at `/amcdt/` (black and gold, "Precision Technology"). |
| `public/amcdt/legal/` | The final License Agreement and Privacy Policy (Version 1.0, effective October 22, 2026). |
| `store/` | The small store program (Node.js). It starts free trials, opens Stripe checkout, shows the license key after payment, sends the key by email, and opens the Stripe billing portal. |
| `.do/app.yaml` | The "App Spec": the settings DigitalOcean needs. You paste it in Step 6. |
| `tools/` | Helper scripts (not needed for going live). |

Your app `mercy-systems-website` will have **two parts** (DigitalOcean calls them "components"):

1. **`mercy-systems-public`** (static site, the one you already have, same name so the domain stays attached): serves everything in `public/`.
2. **`amcdt-store`** (new, a Node.js "service", smallest size `basic-xxs`): answers these web addresses:

| Address | Goes to | What happens |
|---|---|---|
| `https://mercysystems.com/api/...` | store | Trial, checkout, license page, billing portal, Stripe webhook |
| `https://mercysystems.com/amcdt/buy?trial=...` | store | Forwards to `/amcdt/buy.html?trial=...` (this link is used inside AMCDT and in the trial email) |
| `https://mercysystems.com/downloads/amcdt_1.0.0_amd64.deb` | store | Forwards to the installer file on GitHub Releases (Step 3) |
| everything else | static site | The website pages |

**About the store's memory.** App Platform services have no permanent disk: every redeploy or restart starts
with an empty disk. That is fine: the store keeps only a short-term working copy. The real records live in
**Stripe** (payments, subscriptions) and **Keygen** (license keys). After a restart the store rebuilds what it
needs from Stripe and Keygen automatically (renewals, refunds, cancellations, the billing portal and repeat
trial requests all keep working; this was tested).

---

## Step 1 (optional): Backup

You can skip a backup. **DigitalOcean keeps your previous deployments**, and you can go back to the old
site with one click (see **"If something goes wrong: roll back"** at the end).

If you want one anyway, it takes 1 minute: on GitHub open your repository, click the green **Code** button,
then **Download ZIP**, and keep the file.

Also recommended (1 minute): in DigitalOcean open **Apps**, then **mercy-systems-website**, then **Settings**, then **App Spec**,
and click **Download Spec**. Keep that file: you need two parts of it in Step 6.

---

## Step 2: Put this package on GitHub

Repository: `dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE`, branch `main`.

The easiest way is **GitHub Desktop** (free, https://desktop.github.com):

1. In GitHub Desktop: **File**, then **Clone repository**, and pick `MERCY_SYSTEMS_PUBLIC_WEBSITE`. Note the folder it uses.
2. Open that folder on your computer. **Delete everything in it except the hidden `.git` folder.**
   (On a Mac press Cmd+Shift+. to see hidden files; on Windows tick **View**, then **Hidden items**.)
3. Unzip this package and copy **all** of its contents **except the `downloads` folder** into that folder, including the hidden
   `.do` folder and the `.gitignore` file. The folder should now contain `public`, `store`, `tools`, `.do`,
   `.gitignore`, `README.md` and this guide.
4. Back in GitHub Desktop, type a summary such as `New website and AMCDT store`, then click **Commit to main**
   and **Push origin**.

**Without GitHub Desktop (in the browser):** in the repository, delete the old files, then click **Add file**, then
**Upload files** and drag in the unzipped contents (again without the `downloads` folder). Browsers often skip hidden items (`.do`, `.gitignore`).
That is OK: the App Spec is pasted directly into DigitalOcean in Step 6, so `.do/app.yaml` on GitHub is only a copy.

> Do not upload the `.deb` installer files into the repository itself. They go into a "Release" (next step).

If DigitalOcean starts a deployment by itself after the push, let it run. It may fail until Step 6 is done;
that is expected and does not affect the live site (a failed deployment never replaces the working one).

---

## Step 3: Put the installer files online (GitHub Release)

Customers download AMCDT from `https://mercysystems.com/downloads/amcdt_1.0.0_amd64.deb`. The store forwards
that link to a free GitHub "Release" file. The download stays public, as before: the license key is what is protected.

The files are in the `downloads` folder of this package (the same files as in `AMCDT Website Package/downloads/` on your computer).

1. First check that the repository is **public**: on the repository page the name shows a **Public** label.
   (If it says **Private**, see "Alternative" below.)
2. On the repository page, in the right-hand column, click **Releases**, then **Draft a new release**
   (or **Create a new release**).
3. Click **Choose a tag**, type `v1.0.0`, and click **Create new tag: v1.0.0 on publish**.
4. Release title: `AMCDT 1.0.0`.
5. Drag these files into the box **"Attach binaries by dropping them here"**:
   - `amcdt_1.0.0_amd64.deb` (about 53 MB) **required**
   - `amcdt_1.0.0_amd64.deb.sha256` (recommended)
   - `amcdt_1.0.0_arm64.deb` and `amcdt_1.0.0_arm64.deb.sha256` (optional; the website currently offers only amd64)
6. Wait until every file shows as fully uploaded, then click **Publish release**.
7. Test: open this address in your browser. The download should start:
   `https://github.com/dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE/releases/download/v1.0.0/amcdt_1.0.0_amd64.deb`

This address (without the file name) is already filled in as `DOWNLOAD_BASE_URL` in the App Spec.

**Future versions:** make a new release (for example `v1.1.0`) with `amcdt_1.1.0_amd64.deb`, then in DigitalOcean change
`PRODUCT_VERSION` to `1.1.0` and `DOWNLOAD_BASE_URL` to end in `/v1.1.0`. Also update `productVersion` and `debSha256`
in `public/amcdt/assets/js/config.js` (the download page shows them).

**Alternative if the repository must stay private:** GitHub Release files in a private repository are not downloadable by customers.
Instead use DigitalOcean **Spaces** (about $5/month): **Create**, then **Spaces Object Storage**, pick the same region, then
upload the `.deb` files and set each file's permission to **Public**. Copy the file's address without the file name
(for example `https://yourspace.nyc3.digitaloceanspaces.com/amcdt`) and use it as `DOWNLOAD_BASE_URL`.

---

## Step 4: Email for license keys (SMTP on port 2525)

The store emails license keys and trial keys from `licenses@mercysystems.com`. DigitalOcean blocks the usual email ports,
so use a transactional email provider that accepts **port 2525** (for example SendGrid, Mailgun, Postmark, Brevo or SMTP2GO;
check on the provider's site that 2525 is offered on your plan).

1. Create an account with the provider.
2. Add and **verify the domain `mercysystems.com`**. The provider shows a few DNS records (SPF, DKIM, sometimes a return-path or
   DMARC record). Add them where your domain's DNS is managed (if the domain uses DigitalOcean DNS: **Networking**, then **Domains**,
   then `mercysystems.com`, then add each record). Wait until the provider shows the domain as verified. Without this, key emails land in spam.
3. In the provider, create **SMTP credentials**. Write down:
   - SMTP server name, which becomes `SMTP_HOST` (for example `smtp.sendgrid.net`, `smtp.mailgun.org`)
   - user name, which becomes `SMTP_USER` (secret)
   - password or API key, which becomes `SMTP_PASS` (secret)
4. Port stays `2525` with `SMTP_SECURE=false` (the connection is still encrypted with STARTTLS). If the provider says "use port 465 with SSL",
   set `SMTP_PORT=465` and `SMTP_SECURE=true` instead.

---

## Step 5: Stripe

### 5a. Webhook (Stripe tells the store about payments)

1. Stripe Dashboard, then **Developers** (or **Workbench**), then **Webhooks**, then **Add endpoint** (or **Add destination**).
2. Endpoint URL: **`https://mercysystems.com/api/stripe-webhook`**
3. Choose "Your account" events and select exactly these **8 events**:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
4. Save. Open the new endpoint and click **Reveal** under **Signing secret**. It starts with `whsec_`. This is `STRIPE_WEBHOOK_SECRET`.

### 5b. Secret key

**Developers**, then **API keys**, then **Secret key** (starts with `sk_live_`; in test mode `sk_test_`). This is `STRIPE_SECRET_KEY`.

### 5c. Customer portal

**Settings**, then **Billing**, then **Customer portal**: make sure it is **activated** and allows customers to update payment methods,
view invoices and cancel subscriptions. Your portal login link is already filled in:
`https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000`.

### Prices (already filled in)

| Plan | Stripe price ID |
|---|---|
| Monthly ($59) | `price_1UT9UTBfrlpQFrU7LwWRrYWP` |
| Annual ($590) | `price_1UT9XeBfrlpQFrU7JrBdHfHP` |
| One-time / perpetual ($1,490) | `price_1UT9YIBfrlpQFrU7E01qO8iR` |

> Price IDs belong to either test mode or live mode. Check in Stripe (**Product catalog**) that these three are in the mode
> whose secret key you use. If you test in test mode first, use the test-mode price IDs while testing, then switch back.

---

## Step 6: DigitalOcean: update the app

### 6a. Paste the App Spec

1. Log in to DigitalOcean, then **Apps**, then **mercy-systems-website**, then the **Settings** tab.
2. Scroll to **App Spec** and click **Download Spec** if you have not done so yet (this is your copy of the old settings).
3. Open `.do/app.yaml` from this package in a text editor (Notepad, TextEdit in plain-text mode, or VS Code).
4. From your downloaded old spec, copy over **unchanged**:
   - the `region:` line
   - the whole `domains:` block (this keeps mercysystems.com attached)
   - if your static site component had a different `name:` than `mercy-systems-public`, use that name in **both** places in the file
     (the `static_sites` section and the last rule under `ingress`).
5. In DigitalOcean click **Edit** next to App Spec, select everything, delete it, paste the edited `app.yaml`, and click **Save**.
6. DigitalOcean shows a summary of changes and the new monthly cost (the store at `basic-xxs` is the smallest size, about $5/month;
   check the number on screen). Confirm. A deployment starts.

> If DigitalOcean refuses the spec because the five secret entries have no value, delete those five lines
> (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KEYGEN_ADMIN_TOKEN`, `SMTP_USER`, `SMTP_PASS`), save, and add them in 6b with **Encrypt** ticked.

The first deployment of the store will **fail its start-up on purpose** until the secret values are entered (it refuses to run with
settings missing). The existing website keeps running while that happens.

### 6b. Enter the secret values and the email server

1. **Settings** tab, then click the **amcdt-store** component, then **Environment Variables**, then **Edit**.
2. Fill in these values and make sure **Encrypt** is ticked for each secret:

| Name | Value | Secret? |
|---|---|---|
| `STRIPE_SECRET_KEY` | Step 5b (`sk_live_...`) | **Yes, Encrypt** |
| `STRIPE_WEBHOOK_SECRET` | Step 5a (`whsec_...`) | **Yes, Encrypt** |
| `KEYGEN_ADMIN_TOKEN` | Keygen dashboard, then **Tokens** (or Settings, then Tokens), then the admin token (create one if needed) | **Yes, Encrypt** |
| `SMTP_USER` | Step 4 | **Yes, Encrypt** |
| `SMTP_PASS` | Step 4 | **Yes, Encrypt** |
| `SMTP_HOST` | Step 4, replace `REPLACE_WITH_PROVIDER_SMTP_HOST` | no |

3. Click **Save**. A new deployment starts. Watch the **Activity** tab until it says **Deployed** (about 3 to 6 minutes).
   If it fails, click the deployment, then **Runtime Logs** or **Build Logs**: a line like `Missing required settings: ...` names what is still empty.

### All settings (for reference)

Already filled in by the App Spec; you normally only touch the six above.

| Name | Value in the spec | What it is / where it comes from |
|---|---|---|
| `SITE_URL` | `https://mercysystems.com/amcdt` | Address of the AMCDT pages (used in emails and Stripe return links) |
| `HOST` / `PORT` | `0.0.0.0` / `8080` | Where the store listens inside DigitalOcean (do not change) |
| `TRUST_PROXY` / `CLIENT_IP_HEADER` | `true` / `do-connecting-ip` | Lets the store see visitors' real addresses for its abuse limits |
| `DATABASE_PATH` | `/tmp/amcdt-store.sqlite` | Short-term working copy (see "About the store's memory") |
| `NODE_ENV` | `production` | Standard |
| `PRODUCT_VERSION` | `1.0.0` | Current AMCDT version |
| `DOWNLOAD_BASE_URL` | `https://github.com/dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE/releases/download/v1.0.0` | Step 3 |
| `LICENSE_AGREEMENT_VERSION` | `1.0` | Agreement version recorded with each order |
| `MAX_SEATS` | `1` | Most machines per purchase |
| `GRACE_DAYS` | `14` | Days a subscription keeps working after a failed payment |
| `REFUND_ACTION` | `suspend` | What happens to a key on refund (`suspend` or `revoke`) |
| `LICENSE_PAGE_MAX_AGE_DAYS` | `7` | How long the "your license key" page link works |
| `SUPPORT_EMAIL` | `danny@mercysystems.com` | Shown to customers |
| `STRIPE_SECRET_KEY` | (secret) | Step 5b |
| `STRIPE_WEBHOOK_SECRET` | (secret) | Step 5a |
| `STRIPE_PRICE_MONTHLY` / `_ANNUAL` / `_PERPETUAL` | price IDs above | Stripe, Product catalog |
| `STRIPE_AUTOMATIC_TAX` | `false` | Set `true` only after Stripe Tax is set up |
| `STRIPE_TAX_ID_COLLECTION` | `true` | Lets business buyers enter a tax ID |
| `STRIPE_ALLOW_PROMOTION_CODES` | `false` | `true` shows a coupon box at checkout |
| `STRIPE_PORTAL_LOGIN_URL` | `https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000` | Stripe, Customer portal |
| `KEYGEN_API_URL` / `KEYGEN_API_VERSION` | `https://api.keygen.sh` / `1.8` | Keygen Cloud |
| `KEYGEN_ACCOUNT_ID` | `7fa9b5e6-2134-4fdd-bc18-b3218c2d0f06` | Keygen, Settings |
| `KEYGEN_ADMIN_TOKEN` | (secret) | Keygen, Tokens |
| `KEYGEN_POLICY_TRIAL` | `23c09e33-935d-46db-812f-c39a51c70bd8` | Keygen, Policies |
| `KEYGEN_POLICY_MONTHLY` and `KEYGEN_POLICY_ANNUAL` | `6462e2b2-9ed9-487c-afc8-ff93f1cc7f1b` (same subscription policy) | Keygen, Policies |
| `KEYGEN_POLICY_PERPETUAL` | `c24afeda-8ee6-4dc6-93e8-e6435b5e7f74` | Keygen, Policies |
| `TRIAL_ENABLED` / `TRIAL_DAYS` | `true` / `14` | Free trial on/off and length |
| `TRIAL_BLOCK_FREE_WEBMAIL` | `false` | `true` refuses Gmail/Yahoo/etc. addresses for trials |
| `SMTP_HOST` | from Step 4 | Email provider's server |
| `SMTP_PORT` / `SMTP_SECURE` | `2525` / `false` | Email port (change only if the provider says so) |
| `SMTP_USER` / `SMTP_PASS` | (secret) | Step 4 |
| `SMTP_FROM` | `Mercy Systems <licenses@mercysystems.com>` | Sender shown on key emails (domain must be verified in Step 4) |
| `SMTP_REPLY_TO` | `danny@mercysystems.com` | Where customer replies go |

Optional extras you can add the same way: `SMTP_BCC` (get a copy of every key email), `STRIPE_PORTAL_CONFIGURATION_ID`,
`TRIAL_MAX_RESENDS`, `TRIAL_RESEND_COOLDOWN_SEC`, `TRIAL_BLOCKED_DOMAINS`, and the `RATE_LIMIT_...` settings (see `store/.env.example`).

---

## Step 7: Quick checks after "Deployed"

Open each address in a browser:

- [ ] `https://mercysystems.com/` shows the new black-and-gold homepage
- [ ] `https://mercysystems.com/amcdt/` shows the AMCDT page; the Pricing, Free trial, Download and License links in its menu open
- [ ] `https://mercysystems.com/amcdt` (no slash at the end) also opens the AMCDT page
- [ ] `https://mercysystems.com/api/health` shows `{"ok":true}`
- [ ] `https://mercysystems.com/amcdt/buy?trial=test` ends on the **buy** page (address shows `buy.html?trial=test`)
- [ ] `https://mercysystems.com/amcdt/download.html`: the **Download** button starts the `.deb` download
- [ ] `https://mercysystems.com/amcdt/license.html` and `privacy.html` show the final documents with "Effective October 22, 2026"
- [ ] Email links on the pages open your email program (not a "protected email" placeholder)

## Step 8: Your own test run

Best done with Stripe in **test mode** first (test secret key, a test webhook endpoint with the same URL and events and its own `whsec_`,
and test price IDs), then switched to live values. Card for test mode: `4242 4242 4242 4242`, any future date, any CVC.

- [ ] **Trial:** on `/amcdt/trial.html` enter your work email and tick the box. The trial key email arrives (check spam). The key appears in Keygen under the trial policy.
- [ ] **Monthly purchase:** buy monthly. You land on the success page showing the key, and the key email arrives once. Keygen shows a new license (subscription policy).
- [ ] **Annual** and **one-time** purchases: same check.
- [ ] **Activate** a key in AMCDT on a test machine.
- [ ] **Manage subscription:** on `/amcdt/manage.html` enter email and key, and the Stripe billing portal opens.
- [ ] **Refund:** refund one test payment in Stripe. Within a minute the license shows as suspended in Keygen.
- [ ] **Webhook health:** Stripe, Webhooks, your endpoint: deliveries show **200** (no red failures).
- [ ] **Restart test (optional):** DigitalOcean, Actions, **Force Rebuild and Deploy**, then open the manage page again with a key from before: it still works.

When switching to live: replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (from the **live** webhook endpoint) and the three price IDs with the live ones, then Save.
Refund your own live test purchases if you make any.

---

## If something goes wrong: roll back

**DigitalOcean rollback (fastest, about 1 minute):** **Apps**, then **mercy-systems-website**, then the **Activity** tab. Find the last deployment from before
today, open its **...** menu, and choose **Rollback**. Confirm. The old site is back within minutes.
(A rollback keeps the app on the old version; later pushes to GitHub will deploy again. If you want to undo the App Spec too, paste your downloaded
old spec back in Settings, then App Spec, then Edit.)

**Through GitHub (if you made the backup):** put the old files back in the repository and push; DigitalOcean deploys them.

Store problems never take the website down: if only the store fails, the pages stay up, and only trial, checkout and the license page stop working until it is fixed.
Logs: **Apps**, then the app, then **Runtime Logs**, then pick `amcdt-store`.

---

## Things to confirm on screen (DigitalOcean screens change from time to time)

1. **Domain still attached:** after Step 6, **Settings**, then **Domains** still lists mercysystems.com as Active.
2. **Static site name and folder:** the static component is named as before and its **Source Directory** is `public`.
3. **Routes:** **Settings**, then **HTTP routes** (or "Ingress") lists `/api`, `/amcdt/buy`, `/downloads` going to `amcdt-store` with "Preserve path prefix"
   on, and `/` going to the static site. If DigitalOcean does not accept the exact `/amcdt/buy` route, remove it: the page `/amcdt/buy/` has a built-in
   fallback that forwards to `buy.html` anyway (check with the Step 7 link).
4. **`/amcdt` without a slash** opens the AMCDT page (DigitalOcean normally adds the slash itself).
5. **Node version:** the store's Build Log mentions Node 22.
6. **Instance size:** the store shows the smallest size (`basic-xxs`, newer name `apps-s-1vcpu-0.5gb`) and **1** container. Keep it at 1.
7. **Health check:** the store's health check path is `/api/health`.
8. **Repository public** (for downloads from GitHub Releases).

---

## For later

- **Changing a page:** edit the file in `public/` on GitHub and commit. DigitalOcean redeploys automatically.
  The AMCDT pages are generated from shared parts; a helper is in `tools/build_pages.py` (run `cd public/amcdt && python3 ../../tools/build_pages.py`).
- **Changing a setting:** DigitalOcean, Settings, amcdt-store, Environment Variables. Saving redeploys.
