'use strict';

// Route-level tests for /dashboard: anonymous redirect, empty state, and
// populated event list.

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

test('Anonymous GET /dashboard redirects to login with returnTo', async () => {
  const fx = buildFixtures();
  installStubs(fx);
  const app = freshApp();
  const res = await request(app, { path: '/dashboard' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/auth/login?returnTo=%2Fdashboard');
});

test('Authenticated GET /dashboard renders the empty state when the user has no events', async () => {
  const user = {
    id: 11, email: 'carol@example.com', display_name: 'Carol',
    password_hash: 'scrypt$stub', created_at: new Date(),
  };
  const fx = buildFixtures({ users: [user] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'carol@example.com');

  const res = await request(app, { path: '/dashboard', cookie });
  assert.equal(res.status, 200);
  assert.match(res.body, /No events yet/);
  assert.match(res.body, /Create your first event/);
});

test('Authenticated GET /dashboard lists owned events', async () => {
  const user = {
    id: 11, email: 'carol@example.com', display_name: 'Carol',
    password_hash: 'scrypt$stub', created_at: new Date(),
  };
  const events = [
    {
      id: 100, code: 'meals26', title: 'Meals 2026', owner_id: 11,
      status: 'draft', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: 101, code: 'retreat', title: 'Retreat', owner_id: 11,
      status: 'draft', created_at: new Date(), updated_at: new Date(),
    },
  ];
  const fx = buildFixtures({ users: [user], events });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'carol@example.com');

  const res = await request(app, { path: '/dashboard', cookie });
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.body, /No events yet/);
  assert.match(res.body, /Meals 2026/);
  assert.match(res.body, /Retreat/);
  assert.match(res.body, /<code>meals26<\/code>/);
});
