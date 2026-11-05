import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { rateLimit, concurrencyLimit, securityHeaders } from '../server/request-protection.mjs';
import { readFileSync } from 'node:fs';

function response() {
  return Object.assign(new EventEmitter(), {
    headers: {},
    code: 200,
    set(key, value) {
      if (typeof key === 'object') Object.assign(this.headers, key);
      else this.headers[key] = value;
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });
}
test('rate limiter bounds clients, rejects bursts, and recovers after expiration', () => {
  let time = 0,
    accepted = 0;
  const limit = rateLimit({ limit: 2, maxKeys: 1, windowMs: 1000, now: () => time });
  const call = (ip) => {
    const res = response();
    limit({ ip }, res, () => accepted++);
    return res;
  };
  call('a');
  call('a');
  assert.equal(call('a').code, 429);
  assert.equal(call('b').code, 429);
  assert.equal(accepted, 2);
  time = 10001;
  assert.equal(call('b').code, 200);
  assert.equal(accepted, 3);
});
test('concurrency capacity is released exactly once on finish or disconnected clients', () => {
  const limit = concurrencyLimit(1);
  const first = response();
  limit({}, first, () => {});
  const second = response();
  limit({}, second, () => assert.fail('overload admitted'));
  assert.equal(second.code, 503);
  first.emit('close');
  first.emit('finish');
  limit({}, response(), () => {});
  const third = response();
  limit({}, third, () => assert.fail('capacity released twice'));
  assert.equal(third.code, 503);
});
test('security headers prevent framing and API indexing without disabling media', () => {
  const res = response();
  securityHeaders({ path: '/api/auth/session' }, res, () => {});
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.match(res.headers['Content-Security-Policy'], /object-src 'none'/);
});
test('SEO uses approved domain, valid structured data and only public sitemap entries', () => {
  const html = readFileSync('index.html', 'utf8');
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema.url, 'https://jejak.kecoalabs.com/');
  const sitemap = readFileSync('public/sitemap.xml', 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
  assert.doesNotMatch(sitemap, /api\/|workspaces\/|account/);
  assert.match(readFileSync('public/tentang.html', 'utf8'), /<h1>/);
});
