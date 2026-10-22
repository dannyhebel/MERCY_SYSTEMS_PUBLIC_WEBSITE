'use strict';
/** Tiny in-memory fixed-window rate limiter (single process; fine for one server instance). */
function rateLimit({ windowMs, max, now = () => Date.now(), keyFn = (req) => req.ip }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
  }, Math.max(windowMs, 1000));
  timer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req) || 'unknown';
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - t) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }
    return next();
  };
}
module.exports = { rateLimit };
