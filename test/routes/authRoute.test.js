'use strict';

// Route-level tests for auth: signup, login, logout, and the
// "already-authenticated" redirects for the auth form pages. Uses the
// shared _authStubs helper to drive the real Express app over HTTP with
// an in-memory session store and model/service stubs.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFixtures, installStubs, freshApp, request, pickCookie,
} = require('./_authStubs');

function setup(opts = {}) {
  const fx = buildFixtures(opts);
  installStubs(fx, opts);
  const app = freshApp();
  return { fx, app };
}

test('GET /auth/signup renders the signup form', async () => {
  const { app } = setup();
  const res = await request(app, { path: '/auth/signup' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Create your account/);
  assert.match(res.body, /name="email"/);
  assert.match(res.body, /name="password"/);
  assert.match(res.body, /name="passwordConfirm"/);
});

test('POST /auth/signup with valid data creates a user and redirects to /dashboard', async () => {
  const { fx, app } = setup();
  const res = await request(app, {
    method: 'POST',
    path: '/auth/signup',
    body: {
      email: 'alice@example.com',
      displayName: 'Alice',
      password: 'hunter2hunter2',
      passwordConfirm: 'hunter2hunter2',
    },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');
  // User row was inserted into the fixture.
  assert.equal(fx.usersByEmail.has('alice@example.com'), true);
  // A session cookie was issued so the next request will be authenticated.
  assert.ok(pickCookie(res));
});

test('POST /auth/signup with duplicate email re-renders with inline error and preserves values', async () => {
  const existing = {
    id: 1,
    email: 'alice@example.com',
    display_name: 'Alice',
    password_hash: 'scrypt$stub',
    created_at: new Date(),
  };
  const { app } = setup({ users: [existing] });
  const res = await request(app, {
    method: 'POST',
    path: '/auth/signup',
    body: {
      email: 'alice@example.com',
      displayName: 'Alice Two',
      password: 'hunter2hunter2',
      passwordConfirm: 'hunter2hunter2',
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /already exists/i);
  // Submitted values are preserved (email + display name; never password).
  assert.match(res.body, /value="alice@example\.com"/);
  assert.match(res.body, /value="Alice Two"/);
  assert.doesNotMatch(res.body, /hunter2hunter2/);
});

test('POST /auth/signup with invalid email and short password re-renders with field errors', async () => {
  const { app } = setup();
  const res = await request(app, {
    method: 'POST',
    path: '/auth/signup',
    body: {
      email: 'not-an-email',
      displayName: '',
      password: 'short',
      passwordConfirm: 'short',
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /valid email/i);
  assert.match(res.body, /at least 8/i);
});

test('GET /auth/login renders the login form', async () => {
  const { app } = setup();
  const res = await request(app, { path: '/auth/login' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Sign in/);
  assert.match(res.body, /name="email"/);
  assert.match(res.body, /name="password"/);
});

test('POST /auth/login with valid credentials sets session and redirects to /dashboard', async () => {
  const existing = {
    id: 7,
    email: 'bob@example.com',
    display_name: 'Bob',
    password_hash: 'scrypt$stub',
    created_at: new Date(),
  };
  const { app } = setup({
    users: [existing],
    verifyPassword: () => true,
  });
  const res = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'anything' },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');
  assert.ok(pickCookie(res));
});

test('POST /auth/login with wrong password re-renders with a generic _form error', async () => {
  const existing = {
    id: 7,
    email: 'bob@example.com',
    display_name: 'Bob',
    password_hash: 'scrypt$stub',
  };
  const { app } = setup({
    users: [existing],
    verifyPassword: () => false,
  });
  const res = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'wrong' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /email or password is incorrect/i);
  // Email is preserved; password is not.
  assert.match(res.body, /value="bob@example\.com"/);
  assert.doesNotMatch(res.body, /value="wrong"/);
});

test('POST /auth/login honors same-origin returnTo', async () => {
  const existing = {
    id: 7, email: 'bob@example.com', display_name: 'Bob', password_hash: 'scrypt$stub',
  };
  const { app } = setup({ users: [existing], verifyPassword: () => true });
  const res = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'x', returnTo: '/events/new' },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/new');
});

test('POST /auth/login ignores off-origin returnTo', async () => {
  const existing = {
    id: 7, email: 'bob@example.com', display_name: 'Bob', password_hash: 'scrypt$stub',
  };
  const { app } = setup({ users: [existing], verifyPassword: () => true });
  const res = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'x', returnTo: '//evil.example.com/x' },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');
});

test('Authenticated user visiting /auth/login is redirected to /dashboard', async () => {
  const existing = {
    id: 7, email: 'bob@example.com', display_name: 'Bob', password_hash: 'scrypt$stub',
  };
  const { app } = setup({ users: [existing], verifyPassword: () => true });

  // Log in to obtain a session cookie.
  const login = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'x' },
  });
  const cookie = pickCookie(login);
  assert.ok(cookie);

  const res = await request(app, { path: '/auth/login', cookie });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');

  const res2 = await request(app, { path: '/auth/signup', cookie });
  assert.equal(res2.status, 302);
  assert.equal(res2.headers.location, '/dashboard');
});

test('POST /auth/logout destroys the session and redirects to /', async () => {
  const existing = {
    id: 7, email: 'bob@example.com', display_name: 'Bob', password_hash: 'scrypt$stub',
  };
  const { app } = setup({ users: [existing], verifyPassword: () => true });

  const login = await request(app, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'bob@example.com', password: 'x' },
  });
  const cookie = pickCookie(login);

  const res = await request(app, { method: 'POST', path: '/auth/logout', cookie });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/');

  // Subsequent dashboard hit should redirect to login (session is gone).
  const dash = await request(app, { path: '/dashboard', cookie });
  assert.equal(dash.status, 302);
  assert.match(dash.headers.location, /^\/auth\/login\?returnTo=/);
});
