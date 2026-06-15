'use strict';

// Shared test helpers for the auth/dashboard/account/create-event route
// suites. Mirrors the require.cache hijacking pattern used by the calendar
// route tests: stub models + select services, then drive the real Express
// app over HTTP with an in-memory session store.

const http = require('node:http');
const session = require('express-session');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://example:example@127.0.0.1:65535/no_such_db_for_tests';

const userModelPath = require.resolve('../../src/models/user');
const eventModelPath = require.resolve('../../src/models/event');
const reservedModelPath = require.resolve('../../src/models/reservedWord');
const passwordServicePath = require.resolve('../../src/services/passwordService');
const eventServicePath = require.resolve('../../src/services/eventService');
const poolPath = require.resolve('../../src/db/pool');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function buildFixtures({ users = [], events = [], reserved = [] } = {}) {
  const usersById = new Map();
  const usersByEmail = new Map();
  users.forEach((u) => {
    usersById.set(Number(u.id), u);
    usersByEmail.set(String(u.email).toLowerCase(), u);
  });
  let nextUserId = users.length + 1;

  const eventsById = new Map();
  events.forEach((e) => eventsById.set(Number(e.id), e));
  let nextEventId = events.length + 1;

  const memberRows = []; // { event_id, user_id, role }
  return {
    usersById, usersByEmail,
    nextUserId() { return nextUserId++; },
    eventsById,
    nextEventId() { return nextEventId++; },
    memberRows,
    reserved: reserved.map((r) => r.toLowerCase()),
  };
}

function purgeAppCache() {
  // Drop every cached module that lives under our source tree so the next
  // freshApp() rebuilds the dependency chain against the fixtures installed
  // in *this* test. Without this, middlewares like attachUser keep a closure
  // over the userModel stub from the previous test and routes silently
  // redirect to /auth/login because req.user comes up null.
  const srcRoot = require('path').resolve(__dirname, '../../src');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(srcRoot)) delete require.cache[key];
  }
}

function installStubs(fx, opts = {}) {
  const verifyPassword = opts.verifyPassword || (() => true);
  purgeAppCache();

  require.cache[userModelPath] = makeStub(userModelPath, {
    async findById(id) { return fx.usersById.get(Number(id)) || null; },
    async findByEmail(email) {
      return fx.usersByEmail.get(String(email).toLowerCase()) || null;
    },
    async create({ email, displayName, passwordHash }) {
      const id = fx.nextUserId();
      const row = {
        id, email, display_name: displayName, password_hash: passwordHash,
        created_at: new Date(), updated_at: new Date(),
      };
      fx.usersById.set(id, row);
      fx.usersByEmail.set(String(email).toLowerCase(), row);
      return row;
    },
    async updateDisplayName(id, displayName) {
      const cur = fx.usersById.get(Number(id));
      if (!cur) return null;
      cur.display_name = displayName;
      return cur;
    },
  });

  require.cache[eventModelPath] = makeStub(eventModelPath, {
    async findById(id) { return fx.eventsById.get(Number(id)) || null; },
    async findByCode(code) {
      for (const e of fx.eventsById.values()) {
        if (String(e.code).toLowerCase() === String(code).toLowerCase()) return e;
      }
      return null;
    },
    async create({ code, title, ownerId }) {
      const id = fx.nextEventId();
      const row = {
        id, code, title, owner_id: ownerId, status: 'draft',
        created_at: new Date(), updated_at: new Date(),
      };
      fx.eventsById.set(id, row);
      return row;
    },
  });

  require.cache[reservedModelPath] = makeStub(reservedModelPath, {
    async isReserved(word) {
      return fx.reserved.includes(String(word).toLowerCase());
    },
    async list() { return fx.reserved.map((w) => ({ word: w, reason: null })); },
  });

  require.cache[passwordServicePath] = makeStub(passwordServicePath, {
    async hash() { return 'scrypt$stub'; },
    async verify(_password, _encoded) { return verifyPassword(_password, _encoded); },
  });

  // Patch pool.withTransaction (and pool itself) BEFORE re-requiring
  // eventService — eventService captures `withTransaction` via destructuring
  // at module-load, so the stub must be in place first.
  const fakeClient = {
    async query(sql, params) {
      if (/INSERT INTO event_members/i.test(sql)) {
        fx.memberRows.push({
          event_id: Number(params[0]),
          user_id: Number(params[1]),
          role: 'owner',
        });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  require.cache[poolPath] = makeStub(poolPath, {
    pool: fakeClient,
    async withTransaction(fn) { return fn(fakeClient); },
  });

  // Replace eventService.listForUser with a fixture-backed version; leave
  // createEvent on the real path so validation + transactional ownership
  // insertion are exercised end-to-end against the fake client above.
  delete require.cache[eventServicePath];
  const realSvc = require('../../src/services/eventService');
  require.cache[eventServicePath] = makeStub(eventServicePath, {
    ...realSvc,
    async listForUser(userId) {
      if (!userId) return [];
      const seen = new Set();
      const owned = [];
      for (const e of fx.eventsById.values()) {
        if (Number(e.owner_id) === Number(userId)) {
          owned.push(e); seen.add(e.id);
        }
      }
      const memberOf = fx.memberRows
        .filter((m) => Number(m.user_id) === Number(userId))
        .map((m) => fx.eventsById.get(Number(m.event_id)))
        .filter((e) => e && !seen.has(e.id));
      return [...owned, ...memberOf];
    },
  });
}

class MemoryStore extends session.Store {
  constructor() { super(); this.sessions = new Map(); }
  get(sid, cb) { cb(null, this.sessions.get(sid) || null); }
  set(sid, sess, cb) {
    // Clone JSON-style so the test isn't accidentally mutating shared state.
    this.sessions.set(sid, JSON.parse(JSON.stringify(sess)));
    cb && cb(null);
  }
  destroy(sid, cb) { this.sessions.delete(sid); cb && cb(null); }
  touch(_sid, _sess, cb) { cb && cb(null); }
}

function freshApp() {
  delete require.cache[require.resolve('../../src/app')];
  // eslint-disable-next-line global-require
  const { createApp } = require('../../src/app');
  return createApp({ sessionStore: new MemoryStore() });
}

function flattenForm(obj) {
  const out = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v == null) continue;
    out.push([k, String(v)]);
  }
  return out;
}

function request(app, { method = 'GET', path: urlPath, headers = {}, body = null, cookie = '' } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      const opts = {
        host: '127.0.0.1', port, method, path: urlPath,
        headers: { ...headers },
      };
      if (cookie) opts.headers.cookie = cookie;
      let payload = null;
      if (body !== null) {
        payload = typeof body === 'string'
          ? body
          : new URLSearchParams(flattenForm(body)).toString();
        opts.headers['content-type'] = opts.headers['content-type'] || 'application/x-www-form-urlencoded';
        opts.headers['content-length'] = Buffer.byteLength(payload).toString();
      }
      const req = http.request(opts, (res) => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, headers: res.headers, body: chunks });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// Extract the session cookie value from a Set-Cookie response header
// for chaining requests.
function pickCookie(res) {
  const sc = res.headers['set-cookie'];
  if (!sc) return '';
  const first = Array.isArray(sc) ? sc.find((c) => c.startsWith('program.sid=')) : sc;
  if (!first) return '';
  return first.split(';')[0];
}

module.exports = {
  buildFixtures, installStubs, freshApp, MemoryStore, request, pickCookie,
};
