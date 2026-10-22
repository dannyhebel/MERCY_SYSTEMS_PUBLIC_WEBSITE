# Regenerates the AMCDT HTML pages in public/amcdt/ (shared header/footer). Run from that folder:
#   cd public/amcdt && python3 ../../tools/build_pages.py
# Edit text here OR directly in the .html files (if you edit the .html files, do not re-run this).
import os
import html as _html
HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
{robots}<link rel="icon" href="assets/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<meta name="theme-color" content="#0b0b0b">
<link rel="stylesheet" href="assets/css/style.css">
<script src="assets/js/config.js" defer></script>
<script src="assets/js/site.js" defer></script>
{extra}</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Mercy Systems home">
      <span class="brand-mark" aria-hidden="true" data-logo="assets/logo.png">M</span>
      <span class="brand-text"><span class="brand-word"><span class="w-mercy">MERCY</span><span class="w-systems">Systems</span></span><small class="brand-tag">PRECISION TECHNOLOGY</small></span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="index.html"{a_home}>AMCDT</a>
      <a href="index.html#pricing">Pricing</a>
      <a href="trial.html"{a_trial}>Free trial</a>
      <a href="download.html"{a_dl}>Download</a>
      <a href="license.html"{a_lic}>License</a>
    </nav>
  </div>
</header>
<main id="main">
'''
FOOT = '''</main>
<footer class="site-footer">
  <div class="wrap">
    <div>&copy; <span data-year>2026</span> Mercy Systems &middot; <a href="/">mercysystems.com</a> &middot; Precision Technology</div>
    <div><a href="license.html">License Agreement</a> &middot; <a href="privacy.html">Privacy Policy</a> &middot; <a href="download.html">Download</a> &middot; <a href="trial.html">Free trial</a> &middot; <a href="manage.html">Manage subscription</a></div>
    <div>Support: <a href="mailto:danny@mercysystems.com">danny@mercysystems.com</a> &middot; Mercy Systems, 398 Log Road, Spring City, Tennessee 37381</div>
  </div>
</footer>
</body>
</html>
'''
DISCLAIMER = '''<p class="disclaimer" id="disclaimer"><strong>Diagnostic tool only.</strong> AMCDT helps your engineers find and understand differences between model and code outputs. It is not a functional-safety tool and does not establish that any model, code, or product is correct or safe. Mercy Systems makes no ISO&nbsp;26262 (or other safety-standard) claims for AMCDT, and no tool qualification or certification evidence is provided. Your own engineering review and safety processes remain your responsibility. See the <a href="license.html">License Agreement</a>.</p>'''

def page(fname, title, desc, body, active, extra='', robots=''):
    a = {k: '' for k in ['a_home','a_trial','a_dl','a_lic']}
    if active: a[active] = ' aria-current="page"'
    html = HEAD.format(title=title, desc=desc, extra=extra, robots=robots, **a) + body + FOOT
    open(fname, 'w').write(html)

AGREE = '''<div class="agree">
  <input type="checkbox" id="{id}" name="agree" required aria-describedby="{id}-help">
  <label for="{id}">I agree to the <a href="license.html" target="_blank" rel="noopener">AMCDT License Agreement</a> (Version <span data-config="licenseAgreementVersion">1.0</span>) on behalf of my company.</label>
</div>
<p id="{id}-help" class="small muted">You must accept the License Agreement before {what}. Opens in a new tab. How we handle your information: <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>'''

# ---------------- index ----------------
index_body = '''<section class="hero" aria-labelledby="hero-title">
  <div class="wrap">
    <h1 id="hero-title"><span class="product-name">AMCDT</span> &mdash; Automotive Model-Code Diagnostic Tool</h1>
    <p class="lead">AMCDT pinpoints exactly where your model and code outputs differ and what is causing it, so your team stops spending countless hours and manpower searching and can fix the problem right away.</p>
    <div class="cta-row">
      <a class="btn" href="trial.html">Start your 14-day free trial &mdash; no credit card</a>
      <a class="btn btn-outline" href="#pricing">See pricing</a>
    </div>
    <p class="small muted mt-s">Linux (.deb) &middot; runs on your own machine &middot; $59/month, $590/year, or $1,490 one-time</p>
  </div>
</section>

<section aria-labelledby="problem-title">
  <div class="wrap">
    <h2 id="problem-title">Stop hunting for mismatches</h2>
    <p class="lead">When model output and code output disagree, finding the first bad signal and the reason behind it can take days of side-by-side plotting. AMCDT does the searching for you: it shows which signal is off, the exact point where the difference starts, and the most likely cause, written in plain language your whole team can act on.</p>
  </div>
</section>

<section aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title">How it works</h2>
    <ol class="steps">
      <li><h3>Load your traces</h3><p>Open the output traces from your model and from your generated or hand-written code. CSV and MAT files are supported.</p></li>
      <li><h3>Run</h3><p>AMCDT lines the traces up and checks every signal, sample by sample, for differences.</p></li>
      <li><h3>Read the answer and export</h3><p>Each mismatch is listed with the signal, where it starts, and what is causing it, in plain language. Export the result as an HTML or JSON report.</p></li>
    </ol>
  </div>
</section>

<section aria-labelledby="features-title">
  <div class="wrap">
    <h2 id="features-title">What you get</h2>
    <ul class="features">
      <li><strong>Every mismatch pinpointed</strong>Which signal differs and the exact sample and time where the difference starts.</li>
      <li><strong>The likely cause, named</strong>Rounding, saturation, library mismatch, compiler effect, or a real bug that needs a closer look.</li>
      <li><strong>Plain-language explanations</strong>Clear findings that engineers, leads, and customers can all read.</li>
      <li><strong>HTML and JSON reports</strong>Share a readable report, or feed the JSON into your own tools and records.</li>
      <li><strong>Your data stays with you</strong>Analysis runs locally on your machine. Trace files are never uploaded; only the license check goes online.</li>
      <li><strong>Built for small teams</strong>Simple licensing for suppliers, Tier 2 / Tier 3 companies, and engineering consultancies: one license per engineer&rsquo;s machine, monthly, yearly, or one-time.</li>
    </ul>
  </div>
</section>

<section id="pricing" aria-labelledby="pricing-title">
  <div class="wrap">
    <h2 id="pricing-title">Pricing</h2>
    <p class="notice"><strong>Not sure yet?</strong> Try AMCDT free for 14 days &mdash; no credit card needed. <a href="trial.html">Start your free trial</a>.</p>
    <p class="muted">Every plan is one license: one installation on one machine, used by one person at a time. License keys may not be shared. Prices in US dollars, excluding any applicable sales tax or VAT.</p>
''' + AGREE.format(id='agree', what='buying') + '''
    <p id="agree-status" class="status" role="alert"></p>
    <div class="pricing">
      <form class="card" data-checkout data-plan="monthly" aria-labelledby="monthly-title">
        <span class="badge">Monthly subscription</span>
        <h3 id="monthly-title">Monthly</h3>
        <p class="price"><span data-config="priceMonthly">$59</span> <small>/ month</small></p>
        <ul>
          <li>All updates while subscribed</li>
          <li>Email support while subscribed</li>
          <li>Renews monthly; cancel any time</li>
          <li>14-day grace period if a renewal payment fails</li>
        </ul>
        <button class="btn" type="submit">Buy Now &mdash; Monthly</button>
        <p class="status" role="status" aria-live="polite"></p>
      </form>
      <form class="card featured" data-checkout data-plan="annual" aria-labelledby="annual-title">
        <span class="badge">Annual subscription</span>
        <h3 id="annual-title">Annual</h3>
        <p class="price"><span data-config="priceAnnual">$590</span> <small>/ year</small></p>
        <ul>
          <li>All updates while subscribed</li>
          <li>Email support while subscribed</li>
          <li>Renews yearly; cancel any time</li>
          <li>14-day grace period if a renewal payment fails</li>
        </ul>
        <button class="btn" type="submit">Buy Now &mdash; Annual</button>
        <p class="status" role="status" aria-live="polite"></p>
      </form>
      <form class="card" data-checkout data-plan="perpetual" aria-labelledby="perpetual-title">
        <span class="badge">One-time purchase</span>
        <h3 id="perpetual-title">One-time (perpetual)</h3>
        <p class="price"><span data-config="pricePerpetual">$1,490</span> <small>one-time</small></p>
        <ul>
          <li>Use the purchased version with no expiry</li>
          <li>Updates and email support for 12 months</li>
          <li>No subscription</li>
        </ul>
        <button class="btn" type="submit">Buy Now &mdash; One-time</button>
        <p class="status" role="status" aria-live="polite"></p>
      </form>
    </div>
    <p class="small muted mt-m">Secure payment by Stripe. Your license key appears on screen right after payment and is also emailed to you. Need more than one seat? Buy one license per seat. Full refund on request within 14 days of purchase. Up to 2 machine transfers per license in any 12 months.</p>
  </div>
</section>

<section aria-labelledby="disc-title">
  <div class="wrap">
    <h2 id="disc-title">Important</h2>
    ''' + DISCLAIMER + '''
  </div>
</section>
'''
page('index.html', 'AMCDT - Automotive Model-Code Diagnostic Tool | Mercy Systems',
     'AMCDT pinpoints exactly where model and code outputs differ and what is causing it. 14-day free trial, no credit card.', index_body, 'a_home')

# ---------------- buy ----------------
buy_body = '''<section aria-labelledby="buy-title">
  <div class="wrap">
    <h1 id="buy-title">Buy AMCDT</h1>
    <p class="lead">Choose Monthly, Annual or One-time. Each purchase is one license for one machine. Your license key appears on screen right after payment and is also emailed to you.</p>
    <form class="card narrow" data-checkout aria-labelledby="buy-title">
      <fieldset class="plain">
        <legend class="legend">Choose your plan (one license)</legend>
        <div class="radio-row">
          <label><input type="radio" name="plan" value="monthly"> Monthly &mdash; <span data-config="priceMonthly">$59</span>/month</label>
          <label><input type="radio" name="plan" value="annual" checked> Annual &mdash; <span data-config="priceAnnual">$590</span>/year</label>
          <label><input type="radio" name="plan" value="perpetual"> One-time &mdash; <span data-config="pricePerpetual">$1,490</span></label>
        </div>
      </fieldset>
''' + AGREE.format(id='agree-buy', what='buying') + '''
      <button class="btn" type="submit">Continue to secure checkout</button>
      <p class="status" role="status" aria-live="polite"></p>
    </form>
    <p class="small muted">If you are coming from your AMCDT trial, checkout uses the email address of your trial. You will receive a new, paid license key: enter it in AMCDT in place of the trial key.</p>
    <p class="small muted">Prices exclude any applicable sales tax or VAT. Full refund on request within 14 days of purchase. Payment is handled by Stripe; we never see your card number (see our <a href="privacy.html">Privacy Policy</a>). Already a customer? <a href="manage.html">Manage your subscription</a>.</p>
    ''' + DISCLAIMER + '''
  </div>
</section>
<script src="assets/js/buy.js" defer></script>
'''
page('buy.html', 'Buy AMCDT | Mercy Systems', 'Buy an AMCDT license: $59/month, $590/year, or $1,490 one-time.', buy_body, None)

# ---------------- trial ----------------
trial_body = '''<section aria-labelledby="trial-title">
  <div class="wrap">
    <h1 id="trial-title">Try AMCDT free for 14 days</h1>
    <p class="lead">No credit card. Enter your work email and we will send you a trial key for one machine.</p>
    <form id="trial-form" class="card narrow" novalidate>
      <div class="field">
        <label for="trial-email">Work email address</label>
        <input id="trial-email" name="email" type="email" autocomplete="email" required maxlength="254" aria-describedby="trial-email-help">
        <p id="trial-email-help" class="small muted">We send the key to this address to confirm it is yours, so please use a real work address. Disposable email addresses cannot be used. One trial per email address and per machine.</p>
      </div>
''' + AGREE.format(id='agree-trial', what='starting a trial') + '''
      <button class="btn" type="submit">Email me my trial key</button>
      <p class="status" role="status" aria-live="polite"></p>
    </form>
    <h2 class="mt-l">How the trial works</h2>
    <ol>
      <li>We email your trial key. The 14 days start when the key is issued.</li>
      <li><a href="download.html">Download</a> and install the AMCDT package, then enter the key when AMCDT asks for it.</li>
      <li>During the trial, AMCDT checks the key over the internet when it starts. Your trace files and reports stay on your machine (see our <a href="privacy.html">Privacy Policy</a>).</li>
      <li>AMCDT shows how many trial days are left. When the trial ends, AMCDT stops running new analyses until you buy; reports you already created stay on your machine. A &ldquo;Buy AMCDT&rdquo; button in the app brings you to checkout.</li>
    </ol>
    ''' + DISCLAIMER + '''
  </div>
</section>
<script src="assets/js/trial.js" defer></script>
'''
page('trial.html', 'AMCDT 14-day free trial | Mercy Systems', 'Start a free 14-day AMCDT trial. No credit card needed.', trial_body, 'a_trial')

# ---------------- success ----------------
success_body = '''<section aria-labelledby="ok-title">
  <div class="wrap">
    <h1 id="ok-title">Thank you for buying AMCDT</h1>
    <p id="key-status" class="status" role="status" aria-live="polite">Loading your license key&hellip;</p>
    <h2>Your license key</h2>
    <p class="small muted">The key activates one installation on one machine. Keep it private.</p>
    <ul id="keys" class="keys" aria-live="polite"></ul>
    <p id="email-note" class="notice mt-m">Your key is also emailed to the address you used at checkout.</p>

    <h2 class="mt-l">Next steps</h2>
    <ol>
      <li><strong>Download</strong> the AMCDT package: <a href="/downloads/amcdt_[VERSION]_amd64.deb" data-href-template="/downloads/amcdt_{VERSION}_amd64.deb">amcdt_<span data-config="productVersion">[VERSION]</span>_amd64.deb</a> (checksum and requirements on the <a href="download.html">download page</a>).</li>
      <li><strong>Install</strong> it (Ubuntu / Debian, 64-bit), from the folder where you saved it:
        <pre><code>sudo apt install ./amcdt_<span data-config="productVersion">[VERSION]</span>_amd64.deb</code></pre></li>
      <li><strong>Start AMCDT</strong> and paste your license key when asked. If you trialled AMCDT, replace the trial key with this one.</li>
    </ol>
    <p class="small muted">Monthly and annual subscriptions renew automatically until cancelled. Full refund on request within 14 days of purchase. Update payment details, see invoices or cancel on the <a href="manage.html">Manage subscription</a> page. Questions? Email <a href="mailto:danny@mercysystems.com">danny@mercysystems.com</a>.</p>
  </div>
</section>
<script src="assets/js/success.js" defer></script>
'''
page('success.html', 'Thank you - your AMCDT license | Mercy Systems', 'Your AMCDT license key and download.', success_body, None,
     robots='<meta name="robots" content="noindex">\n<meta name="referrer" content="no-referrer">\n')

# ---------------- cancel ----------------
cancel_body = '''<section aria-labelledby="c-title">
  <div class="wrap">
    <h1 id="c-title">Checkout cancelled</h1>
    <p class="lead">No payment was taken. You can return to the pricing section whenever you are ready.</p>
    <div class="cta-row">
      <a class="btn" href="index.html#pricing">Back to pricing</a>
      <a class="btn btn-outline" href="trial.html">Try it free for 14 days</a>
    </div>
  </div>
</section>
'''
page('cancel.html', 'Checkout cancelled | AMCDT | Mercy Systems', 'Checkout was cancelled. No payment was taken.', cancel_body, None, robots='<meta name="robots" content="noindex">\n')

# ---------------- download ----------------
dl_body = '''<section aria-labelledby="dl-title">
  <div class="wrap">
    <h1 id="dl-title">Download AMCDT</h1>
    <p class="lead">AMCDT for Linux, version <span data-config="productVersion">[VERSION]</span>. You need a license key (paid or <a href="trial.html">free 14-day trial</a>) to use it.</p>
    <p><a class="btn" href="/downloads/amcdt_[VERSION]_amd64.deb" data-href-template="/downloads/amcdt_{VERSION}_amd64.deb" download>Download amcdt_<span data-config="productVersion">[VERSION]</span>_amd64.deb</a></p>

    <h2>Check the download (optional)</h2>
    <p>SHA-256 checksum:</p>
    <pre class="checksum"><code id="sha"><span data-config="debSha256">[SHA256_OF_DEB]</span></code></pre>
    <p><button type="button" class="btn btn-outline copy-btn" data-copy-target="sha">Copy checksum</button></p>
    <p>In a terminal, in the folder where you saved the file, run the command below. The result must match the checksum above.</p>
    <pre><code>sha256sum amcdt_<span data-config="productVersion">[VERSION]</span>_amd64.deb</code></pre>

    <h2>System requirements</h2>
    <p data-config="systemRequirements">[SYSTEM_REQUIREMENTS]</p>
    <p class="small muted">64-bit (amd64) Linux with the apt package manager, such as Ubuntu or Debian. An internet connection is needed to activate the license key.</p>

    <h2>Install</h2>
    <pre><code>cd ~/Downloads
sudo apt install ./amcdt_<span data-config="productVersion">[VERSION]</span>_amd64.deb</code></pre>
    <p>To remove it later: <code>sudo apt remove amcdt</code></p>

    <h2>Enter your license key</h2>
    <ol>
      <li>Start AMCDT from your applications menu (or run <code>amcdt</code> in a terminal).</li>
      <li>On first start, AMCDT asks for a license key. Paste the key from your email or from the purchase page and confirm.</li>
      <li>AMCDT activates the key for this machine. Each key works on one machine; buy one license per machine.</li>
      <li>Replacing a computer? You can move a license to a new machine up to 2 times in any 12 months. Email <a href="mailto:danny@mercysystems.com">danny@mercysystems.com</a> if you need help.</li>
    </ol>
    <p class="notice">Don&rsquo;t have a key yet? <a href="trial.html">Start a free 14-day trial</a> (no credit card) or <a href="index.html#pricing">buy a license</a>.</p>
    ''' + DISCLAIMER + '''
  </div>
</section>
'''
page('download.html', 'Download AMCDT for Linux | Mercy Systems', 'Download the AMCDT Linux package, checksum, system requirements and install steps.', dl_body, 'a_dl')

# ---------------- license ----------------
lic_body = '''<section aria-labelledby="lic-title">
  <div class="wrap">
    <h1 id="lic-title">AMCDT License Agreement</h1>
    <p>Version <span data-config="licenseAgreementVersion">1.0</span>. You accept this agreement by ticking the box before buying or starting a trial. Please save or print a copy for your records.</p>
    <p><a href="legal/amcdt-license-agreement.txt">Open the agreement as a plain-text file</a> (best for saving or printing).</p>
    <pre id="agreement" class="agreement-text" data-src="legal/amcdt-license-agreement.txt" tabindex="0" aria-label="License Agreement text" aria-busy="true">Loading the agreement&hellip; If it does not appear, use the link above.</pre>
  </div>
</section>
<script src="assets/js/license-page.js" defer></script>
'''
page('license.html', 'AMCDT License Agreement | Mercy Systems', 'The AMCDT End User Software License Agreement.', lic_body, 'a_lic')
# ---------------- privacy ----------------
_priv = open(os.path.join('legal', 'amcdt-privacy-policy.txt'), encoding='utf-8').read()
priv_body = '''<section aria-labelledby="priv-title">
  <div class="wrap">
    <h1 id="priv-title">Privacy Policy</h1>
    <p>How Mercy Systems handles personal information for AMCDT and these pages. Questions or requests: <a href="mailto:danny@mercysystems.com">danny@mercysystems.com</a>.</p>
    <p><a href="legal/amcdt-privacy-policy.txt">Open the Privacy Policy as a plain-text file</a> (best for saving or printing).</p>
    <pre id="privacy" class="agreement-text" tabindex="0" aria-label="Privacy Policy text">''' + _html.escape(_priv, quote=False) + '''</pre>
  </div>
</section>
'''
page('privacy.html', 'Privacy Policy | AMCDT | Mercy Systems', 'How Mercy Systems handles personal information for AMCDT: trials, purchases, payments, license checks and your rights.', priv_body, None)

# ---------------- manage subscription ----------------
manage_body = '''<section aria-labelledby="m-title">
  <div class="wrap">
    <h1 id="m-title">Manage your subscription</h1>
    <p class="lead">Update your payment card, download invoices, or cancel a monthly or annual subscription in Stripe&rsquo;s secure customer portal.</p>
    <form id="portal-form" class="card narrow" novalidate>
      <div class="field">
        <label for="portal-email">Email address used at checkout</label>
        <input id="portal-email" name="email" type="email" autocomplete="email" required maxlength="254">
      </div>
      <div class="field">
        <label for="portal-key">One of your AMCDT license keys</label>
        <input id="portal-key" name="license_key" type="text" autocomplete="off" spellcheck="false" required maxlength="200" aria-describedby="portal-key-help">
        <p id="portal-key-help" class="small muted">From your license email. We use the email and key together only to confirm the subscription is yours.</p>
      </div>
      <button class="btn" type="submit">Open the billing portal</button>
      <p class="status" role="status" aria-live="polite"></p>
    </form>
    <p class="small muted" id="portal-login-row" hidden>Prefer to sign in with a one-time code sent to your email? <a id="portal-login" href="#" rel="noopener">Sign in to the billing portal with your email</a>.</p>
    <p class="small muted">Cancelling stops future renewals; your license keeps working until the end of the period you paid for. One-time (perpetual) licenses have no subscription, but you can still see your invoice in the portal. Refund requests (within 14 days of purchase): email <a href="mailto:danny@mercysystems.com">danny@mercysystems.com</a>.</p>
  </div>
</section>
<script src="assets/js/manage.js" defer></script>
'''
page('manage.html', 'Manage your AMCDT subscription | Mercy Systems', 'Update payment details, download invoices or cancel your AMCDT subscription.', manage_body, None,
     robots='<meta name="robots" content="noindex">\n')
print('pages written')
