// Per-process bounds. Deploy an edge limiter as well for multi-instance deployments.
export function rateLimit({ limit = 300, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const entries = new Map();
  let cleanupAt = 0;
  return (req, res, next) => {
    const time = now();
    if (time >= cleanupAt) {
      for (const [key, value] of entries) if (value.until <= time) entries.delete(key);
      cleanupAt = time + 10000;
    }
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = entries.get(key);
    if (entry && entry.until <= time) {
      entries.delete(key);
      entry = null;
    }
    if (!entry && entries.size < maxKeys) {
      entry = { count: 0, until: time + windowMs };
      entries.set(key, entry);
    }
    if (!entry || ++entry.count > limit) {
      return res
        .set(
          'Retry-After',
          String(Math.max(1, Math.ceil(((entry?.until || time + 10000) - time) / 1000))),
        )
        .set('Cache-Control', 'no-store')
        .status(429)
        .json({ error: 'Too many requests. Please try again shortly.' });
    }
    next();
  };
}

export function concurrencyLimit(limit) {
  let active = 0;
  return (_req, res, next) => {
    if (active >= limit)
      return res
        .set('Retry-After', '3')
        .set('Cache-Control', 'no-store')
        .status(503)
        .json({ error: 'Service busy. Please try again shortly.' });
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy':
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  if (req.path.startsWith('/api/') || req.path.startsWith('/workspaces/'))
    res.set('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.NODE_ENV === 'production' && req.secure)
    res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
