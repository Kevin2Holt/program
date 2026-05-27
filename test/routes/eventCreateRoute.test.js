'use strict';

// Route-level tests for /events/new and POST /events. Exercises the real
// event service (code shape + reserved-word + duplicate validation) and
// the transactional owner-membership insert (captured via fx.memberRows
// by the stubbed pool in _authStubs).

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

function makeOwner() {
  return {
    id: 31, email: 'owner@example.com', display_name: 'Owner',
    password_hash: 'scrypt$stub', created_at: new Date(),
  };
}

test('Anonymous GET /events/new redirects to login', async () => {
  const fx = buildFixtures();
  installStubs(fx);
  const app = freshApp();
  const res = await request(app, { path: '/events/new' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/auth\/login\?returnTo=%2Fevents%2Fnew$/);
});

test('Anonymous POST /events redirects to login', async () => {
  const fx = buildFixtures();
  installStubs(fx);
  const app = freshApp();
  const res = await request(app, {
    method: 'POST',
    path: '/events',
    body: { code: 'meals26', title: 'Meals' },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/auth\/login\?returnTo=/);
});

test('Authenticated GET /events/new renders the create form', async () => {
  const fx = buildFixtures({ users: [makeOwner()] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const res = await request(app, { path: '/events/new', cookie });
  assert.equal(res.status, 200);
  assert.match(res.body, /Create event/);
  assert.match(res.body, /name="code"/);
  assert.match(res.body, /name="title"/);
  assert.match(res.body, /action="\/events"/);
});

test('POST /events with valid data creates the event and PRGs to its calendar', async () => {
  const fx = buildFixtures({ users: [makeOwner()], reserved: ['admin', 'dashboard'] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const res = await request(app, {
    method: 'POST',
    path: '/events',
    cookie,
    body: { code: 'meals26', title: 'Meals 2026' },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/events\/\d+\/calendar$/);

  // The event was created with the owner set to the authenticated user.
  const created = Array.from(fx.eventsById.values()).find((e) => e.code === 'meals26');
  assert.ok(created, 'event row was created');
  assert.equal(created.owner_id, 31);
  assert.equal(created.title, 'Meals 2026');

  // An owner row in event_members was inserted via the same transaction.
  const member = fx.memberRows.find((m) => m.event_id === created.id);
  assert.ok(member, 'event_members owner row was inserted');
  assert.equal(member.user_id, 31);
  assert.equal(member.role, 'owner');
});

test('POST /events with reserved code re-renders with an inline error', async () => {
  const fx = buildFixtures({ users: [makeOwner()], reserved: ['admin', 'dashboard'] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const res = await request(app, {
    method: 'POST',
    path: '/events',
    cookie,
    body: { code: 'admin', title: 'Should fail' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /reserved/i);
  // Submitted values are preserved.
  assert.match(res.body, /value="admin"/);
  assert.match(res.body, /value="Should fail"/);
});

test('POST /events with duplicate code re-renders with an inline error', async () => {
  const owner = makeOwner();
  const existing = {
    id: 500, code: 'meals26', title: 'Existing', owner_id: 31,
    status: 'draft', created_at: new Date(), updated_at: new Date(),
  };
  const fx = buildFixtures({ users: [owner], events: [existing] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const res = await request(app, {
    method: 'POST',
    path: '/events',
    cookie,
    body: { code: 'meals26', title: 'New attempt' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /already in use/i);
});

test('POST /events with malformed code re-renders with a code shape error', async () => {
  const fx = buildFixtures({ users: [makeOwner()] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const cases = [
    { code: 'AB', msg: /at least 3/i }, // too short
    { code: '-meals', msg: /lowercase letters, digits, and hyphens/i }, // leading hyphen
    { code: 'meals-', msg: /lowercase letters, digits, and hyphens/i }, // trailing hyphen
    { code: 'a b c', msg: /lowercase letters, digits, and hyphens/i }, // spaces
    { code: 'a'.repeat(33), msg: /at most 32/i }, // too long
  ];
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop
    const res = await request(app, {
      method: 'POST',
      path: '/events',
      cookie,
      body: { code: c.code, title: 'X' },
    });
    assert.equal(res.status, 400, `code=${c.code}`);
    assert.match(res.body, c.msg, `code=${c.code}`);
  }
});

test('POST /events with missing title re-renders with a title error', async () => {
  const fx = buildFixtures({ users: [makeOwner()] });
  installStubs(fx, { verifyPassword: () => true });
  const app = freshApp();
  const cookie = await loginAs(app, 'owner@example.com');

  const res = await request(app, {
    method: 'POST',
    path: '/events',
    cookie,
    body: { code: 'meals26', title: '' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /title is required/i);
});
