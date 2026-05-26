'use strict';

// Integration-style tests for the organizer calendar setup route.
//
// We instantiate the real Express app via createApp() with a memory session
// store and stub the persistence boundary (event model + calendar config
// model) by hijacking Node's require cache. This exercises the full route
// pipeline — loadEvent, requireCalendarPermission, controller, and the EJS
// template — without touching Postgres.
//
// requireAuth is replaced with a permissive stub in this file so the test
// suite never needs real session cookies; a separate stand-alone test
// exercises the redirect behavior directly against the real middleware.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const session = require('express-session');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://example:example@127.0.0.1:65535/no_such_db_for_tests';

// --- Stub the model layer BEFORE app.js requires its dependency chain. ---
const eventModelPath = require.resolve('../../src/models/event');
const calendarConfigModelPath = require.resolve('../../src/models/calendarConfig');
const calendarItemModelPath = require.resolve('../../src/models/calendarItem');
const calendarRuleModelPath = require.resolve('../../src/models/calendarAvailabilityRule');
const calendarBookingModelPath = require.resolve('../../src/models/calendarBooking');
const requireAuthPath = require.resolve('../../src/middleware/requireAuth');

const eventStore = new Map();
eventStore.set(42, { id: 42, code: 'meals26', title: 'Test event', owner_id: 1 });

const configStore = new Map();
let nextConfigId = 1;

function installStubs() {
  require.cache[eventModelPath] = makeStub(eventModelPath, {
    async findById(id) { return eventStore.get(Number(id)) || null; },
    async findByCode(code) {
      for (const ev of eventStore.values()) if (ev.code === code) return ev;
      return null;
    },
  });

  require.cache[calendarConfigModelPath] = makeStub(calendarConfigModelPath, {
    async findByEventId(eventId) {
      return configStore.get(Number(eventId)) || null;
    },
    async findById(id) {
      for (const cfg of configStore.values()) if (cfg.id === id) return cfg;
      return null;
    },
    async create(eventId) {
      const row = {
        id: nextConfigId++,
        event_id: Number(eventId),
        title: 'Calendar',
        enabled: false,
        public_visibility_state: 'draft',
        date_window_mode: 'fixed',
        fixed_start_date: null,
        fixed_end_date: null,
        rolling_window_unit: null,
        rolling_window_size: null,
        time_behavior_mode: 'date_only',
        event_time_zone: 'UTC',
        notes_enabled: false,
        email_confirmation_enabled: false,
        add_to_calendar_enabled: false,
        calendar_export_mode: 'combined',
        form_config: {},
        export_defaults: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      configStore.set(Number(eventId), row);
      return row;
    },
    async update(id, patch) {
      for (const [eventId, cfg] of configStore.entries()) {
        if (cfg.id === id) {
          const merged = { ...cfg, ...patch, updated_at: new Date() };
          configStore.set(eventId, merged);
          return merged;
        }
      }
      return null;
    },
  });

  require.cache[calendarItemModelPath] = makeStub(calendarItemModelPath, {
    async listForEvent() { return []; },
  });
  require.cache[calendarRuleModelPath] = makeStub(calendarRuleModelPath, {
    async listForConfig() { return []; },
  });
  require.cache[calendarBookingModelPath] = makeStub(calendarBookingModelPath, {
    async listForEvent() { return []; },
  });

  // Permissive auth: always injects a user. The redirect path is exercised
  // by a separate unit-style test below.
  require.cache[requireAuthPath] = makeStub(requireAuthPath, function passAuth(req, _res, next) {
    req.user = { id: 1, email: 'org@test' };
    return next();
  });
}

function makeStub(absPath, exportsValue) {
  return {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports: exportsValue,
  };
}

installStubs();
// Force the app module to be (re-)required with the stubs in place.
delete require.cache[require.resolve('../../src/app')];
const { createApp } = require('../../src/app');

class MemoryStore extends session.Store {
  constructor() { super(); this.sessions = new Map(); }
  get(sid, cb) { cb(null, this.sessions.get(sid) || null); }
  set(sid, sess, cb) { this.sessions.set(sid, sess); cb && cb(null); }
  destroy(sid, cb) { this.sessions.delete(sid); cb && cb(null); }
  touch(_sid, _sess, cb) { cb && cb(null); }
}

function buildApp() {
  return createApp({ sessionStore: new MemoryStore() });
}

function flattenForm(obj, prefix = '', out = []) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenForm(v, key, out);
    } else if (v !== undefined && v !== null && v !== '') {
      out.push([key, String(v)]);
    }
  }
  return out;
}

function request(app, { method = 'GET', path: urlPath, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      const opts = {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: { ...headers },
      };
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

function fullValidBody(overrides = {}) {
  return {
    title: 'Meals',
    enabled: 'on',
    public_visibility_state: 'published',
    date_window_mode: 'fixed',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
    time_behavior_mode: 'date_only',
    event_time_zone: 'America/New_York',
    calendar_export_mode: 'combined',
    form_config: {
      name: { enabled: 'on', required: 'on' },
      phone: { enabled: 'on', required: 'on' },
      contact_method: { enabled: 'on' },
      email: { enabled: 'on' },
    },
    email_confirmation_enabled: 'on',
    ...overrides,
  };
}

// ---- Tests -------------------------------------------------------------------

test('GET /events/:id/calendar/setup renders the setup form', async () => {
  configStore.clear();
  const res = await request(buildApp(), { path: '/events/42/calendar/setup' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Calendar setup/);
  assert.match(res.body, /name="title"/);
  assert.match(res.body, /name="date_window_mode"/);
  assert.match(res.body, /name="event_time_zone"/);
  assert.match(res.body, /name="form_config\[phone\]\[enabled\]"/);
  // Email confirmation should be present but disabled by default (email field off).
  assert.match(res.body, /name="email_confirmation_enabled"[^>]*disabled/);
});

test('GET /events/:id/calendar/setup returns 404 for unknown event', async () => {
  const res = await request(buildApp(), { path: '/events/9999/calendar/setup' });
  assert.equal(res.status, 404);
});

test('requireAuth (real middleware) redirects unauthenticated users', () => {
  // Exercise the real middleware directly so the rest of the file can use
  // the permissive auth stub.
  const realRequireAuth = require('../../src/middleware/requireAuth.js'); // hits the stub
  // Pull the real module from disk fresh by deleting the stub then requiring:
  delete require.cache[requireAuthPath];
  // eslint-disable-next-line global-require
  const real = require('../../src/middleware/requireAuth');
  // Reinstall the stub immediately so later tests stay permissive.
  require.cache[requireAuthPath] = makeStub(requireAuthPath, realRequireAuth);

  let redirected = null;
  const req = { user: null, originalUrl: '/events/42/calendar/setup' };
  const res = { redirect(url) { redirected = url; } };
  const next = () => assert.fail('next() should not be called when unauthenticated');
  real(req, res, next);
  assert.match(redirected || '', /\/auth\/login/);
  assert.match(redirected || '', /returnTo=/);
});

test('POST /events/:id/calendar/setup persists a valid configuration', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody(),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/42/calendar/setup');
  const persisted = configStore.get(42);
  assert.ok(persisted, 'config row must exist after POST');
  assert.equal(persisted.title, 'Meals');
  assert.equal(persisted.enabled, true);
  assert.equal(persisted.public_visibility_state, 'published');
  assert.equal(persisted.fixed_start_date, '2026-06-01');
  assert.equal(persisted.fixed_end_date, '2026-06-30');
  assert.equal(persisted.event_time_zone, 'America/New_York');
  assert.equal(persisted.email_confirmation_enabled, true);
  assert.equal(persisted.form_config.phone.enabled, true);
  assert.equal(persisted.form_config.email.enabled, true);
});

test('POST setup re-renders with errors when fixed end is before start', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody({
      fixed_start_date: '2026-06-30',
      fixed_end_date: '2026-06-01',
      email_confirmation_enabled: '',
      form_config: { name: { enabled: 'on', required: 'on' } },
    }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /End date must be on or after the start date/);
});

test('POST setup blocks email confirmation when the email field is disabled', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody({
      form_config: { name: { enabled: 'on', required: 'on' } }, // no email
      email_confirmation_enabled: 'on',
    }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Email confirmation requires the email form field to be enabled/);
  const persisted = configStore.get(42);
  // The config row was created by getOrCreateForEvent but the patch was NOT
  // applied — email_confirmation_enabled should remain false.
  assert.equal(persisted.email_confirmation_enabled, false);
});

test('POST setup rejects a rolling window without unit', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody({
      date_window_mode: 'rolling',
      rolling_window_size: '4',
      fixed_start_date: '',
      fixed_end_date: '',
      email_confirmation_enabled: '',
      form_config: { name: { enabled: 'on', required: 'on' } },
    }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Rolling window unit is required/);
});

test('POST setup persists a valid rolling-window config', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody({
      date_window_mode: 'rolling',
      rolling_window_size: '6',
      rolling_window_unit: 'weeks',
      fixed_start_date: '',
      fixed_end_date: '',
      email_confirmation_enabled: '',
      form_config: { name: { enabled: 'on', required: 'on' } },
    }),
  });
  assert.equal(res.status, 302);
  const persisted = configStore.get(42);
  assert.equal(persisted.date_window_mode, 'rolling');
  assert.equal(persisted.rolling_window_unit, 'weeks');
  assert.equal(persisted.rolling_window_size, 6);
  assert.equal(persisted.fixed_start_date, null);
});

test('POST setup rejects an invalid IANA time zone', async () => {
  configStore.clear();
  const res = await request(buildApp(), {
    method: 'POST',
    path: '/events/42/calendar/setup',
    body: fullValidBody({
      event_time_zone: 'Earth/Mars',
      email_confirmation_enabled: '',
      form_config: { name: { enabled: 'on', required: 'on' } },
    }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /valid IANA time zone/);
});
