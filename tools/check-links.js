#!/usr/bin/env node
/**
 * Local link checker (no dependencies). Crawls every page reachable from the
 * start URL on the same host and checks every href/src, including #anchors.
 *
 *   node tools/check-links.js http://127.0.0.1:3005/amcdt/ site
 * (the optional 2nd argument is the local site folder: every *.html in it is
 *  also used as a starting page, so pages nobody links to are checked too)
 *
 * Known, expected exceptions are reported separately, not as failures:
 *   - /downloads/amcdt_[VERSION]_amd64.deb : the .deb does not exist yet
 *   - assets/logo.png                       : optional; the text logo is the fallback
 */
'use strict';
const start = process.argv[2] || 'http://127.0.0.1:3005/amcdt/';
const origin = new URL(start).origin;
const EXPECTED_MISSING = [/\/downloads\/amcdt_.*_amd64\.deb$/, /\/assets\/logo\.png$/];

const pages = new Map(); // url -> html
const checked = new Map(); // url -> status
const problems = [];
const expected = [];

function extract(html) {
  const out = [];
  const re = /\b(?:href|src|data-src|data-logo)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function ids(html) {
  const s = new Set();
  const re = /\bid\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) s.add(m[1]);
  return s;
}

async function fetchStatus(url) {
  if (checked.has(url)) return checked.get(url);
  const res = await fetch(url, { redirect: 'follow' });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('text/html') ? await res.text() : (await res.arrayBuffer(), null);
  checked.set(url, res.status);
  if (body !== null && res.ok) pages.set(url, body);
  return res.status;
}

(async () => {
  const queue = [start];
  if (process.argv[3]) {
    for (const f of require('fs').readdirSync(process.argv[3])) if (f.endsWith('.html')) queue.push(new URL(f, start).href);
  }
  const seenPages = new Set();
  const anchorChecks = [];
  while (queue.length) {
    const page = queue.shift();
    if (seenPages.has(page)) continue;
    seenPages.add(page);
    const st = await fetchStatus(page);
    if (st !== 200) { problems.push(`${st}  ${page}`); continue; }
    const html = pages.get(page);
    for (const raw of extract(html)) {
      if (/^(mailto:|tel:|javascript:)/.test(raw)) continue;
      const u = new URL(raw, page);
      if (u.origin !== origin) continue; // external links are not checked
      const target = u.origin + u.pathname + u.search;
      if (u.hash) anchorChecks.push({ from: page, target, id: decodeURIComponent(u.hash.slice(1)) });
      if (raw.startsWith('#')) continue;
      const s = await fetchStatus(target);
      if (s >= 400) {
        if (EXPECTED_MISSING.some((re) => re.test(u.pathname))) expected.push(`${s}  ${u.pathname}  (linked from ${new URL(page).pathname})`);
        else problems.push(`${s}  ${target}  (linked from ${page})`);
      } else if (pages.has(target) && !seenPages.has(target)) queue.push(target);
    }
  }
  for (const a of anchorChecks) {
    const html = pages.get(a.target);
    if (html && !ids(html).has(a.id)) problems.push(`missing anchor #${a.id} in ${a.target} (linked from ${a.from})`);
  }
  console.log(`Pages crawled: ${seenPages.size}`);
  for (const p of [...seenPages].sort()) console.log(`  ${checked.get(p)}  ${new URL(p).pathname}`);
  console.log(`Unique internal URLs checked: ${checked.size}`);
  console.log(`Expected-missing (placeholders, not failures): ${new Set(expected).size}`);
  for (const e of new Set(expected)) console.log(`  ${e}`);
  console.log(`BROKEN: ${problems.length}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
