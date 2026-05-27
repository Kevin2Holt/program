'use strict';

// Route-level tests for /account: anonymous redirect and authenticated
// rendering of email, display name, and joined date.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFixtures, installStubs, freshApp, request, pickCookie,
} = require('./_authStubs');

async function loginAs(app, email) {
  const res = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email, password: 'anything' },
  });
  return pickCookie(res);
}

test('Anonymous GET /account redirects to login with returnTo', async () => {
  const fx = buildFixtures();
  installStubs(fx);
  const app = freshApp();
  const res = await request(app, { path: '/account' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/auth/login?returnTo=%2Faccount');
});

test('Authenticated GET /account renders email, display name, and joined date', async () => {
  const user = {
    id: 21,
    email: 'dee@example.com',
    display_name: 'Dee',
    password_hash: 'scrypt$stub',
    created_at: new Date('2024-03-14T00:00:00Z'),
  };
  const fx = buildFixtures({ users: [user] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'dee@example.com');

  const res = await request(app, { path: '/account', cookie });
  assert.equal(res.status, 200);
  assert.match(res.body, /dee@example\.com/);
  assert.match(res.body, /Dee/);
  assert.match(res.body, /2024-03-14/);
  // Logout form is present.
  assert.match(res.body, /action="\/auth\/logout"/);
});

test('Authenticated GET /account renders fallback when displayName is missing', async () => {
  const user = {
    id: 22,
    email: 'noname@example.com',
    display_name: null,
    password_hash: 'scrypt$stub',
    created_at: new Date('2025-01-02T00:00:00Z'),
  };
  const fx = buildFixtures({ users: [user] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'noname@example.com');

  const res = await request(app, { path: '/account', cookie });
  assert.equal(res.status, 200);
  assert.match(res.body, /\(not set\)/);
});
