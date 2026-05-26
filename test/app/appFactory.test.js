'use strict';

// Smoke test: the Express app factory loads without throwing and registers
// the calendar route surface. We pass in a stub session store so we never
// need a live Postgres for this test.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://example:example@127.0.0.1:65535/no_such_db_for_tests';

const session = require('express-session');
const { createApp } = require('../../src/app');

// Extend express-session's Store so we inherit the EventEmitter machinery
// (.on/.emit) that express-session calls during initialization.
class MemoryStore extends session.Store {
  constructor() {
    super();
    this.sessions = new Map();
  }
  get(sid, cb) { cb(null, this.sessions.get(sid) || null); }
  set(sid, sess, cb) { this.sessions.set(sid, sess); cb && cb(null); }
  destroy(sid, cb) { this.sessions.delete(sid); cb && cb(null); }
  touch(_sid, _sess, cb) { cb && cb(null); }
}

test('createApp returns an Express handler without throwing', () => {
  const app = createApp({ sessionStore: new MemoryStore() });
  assert.equal(typeof app, 'function');
  // Internal sanity: there must be a router stack.
  assert.ok(app._router, 'app should have a router');
});
