'use strict';

// Shared stubs for public calendar route integration tests. Mirrors the
// organizer stubs but with: no requireAuth override (public has no auth),
// a stubbed db/pool.withTransaction (finalizeBooking is wrapped in one),
// and a richer in-memory booking store so we can test the full submit +
// confirmation round-trip.

const http = require('node:http');
const session = require('express-session');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://example:example@127.0.0.1:65535/no_such_db_for_tests';

const eventModelPath = require.resolve('../../src/models/event');
const calendarConfigModelPath = require.resolve('../../src/models/calendarConfig');
const calendarItemModelPath = require.resolve('../../src/models/calendarItem');
const calendarOccurrenceModelPath = require.resolve('../../src/models/calendarOccurrence');
const calendarRuleModelPath = require.resolve('../../src/models/calendarAvailabilityRule');
const calendarBookingModelPath = require.resolve('../../src/models/calendarBooking');
const poolPath = require.resolve('../../src/db/pool');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function buildFixtures() {
  const events = new Map();
  events.set(42, { id: 42, code: 'cal26', title: 'Public Test', owner_id: 1 });

  const configs = new Map();
  configs.set(42, {
    id: 1,
    event_id: 42,
    title: 'Public Calendar',
    enabled: true,
    public_visibility_state: 'published',
    date_window_mode: 'fixed',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-07',
    rolling_window_unit: null,
    rolling_window_size: null,
    time_behavior_mode: 'date_only',
    event_time_zone: 'America/New_York',
    notes_enabled: false,
    email_confirmation_enabled: false,
    add_to_calendar_enabled: false,
    calendar_export_mode: 'combined',
    form_config: { name: { enabled: true, required: true } },
    export_defaults: {},
    created_at: new Date(),
    updated_at: new Date(),
  });

  return {
    events,
    configs,
    items: new Map(),
    nextItemId: 1,
    occurrences: new Map(),
    nextOccurrenceId: 1,
    rules: new Map(),
    ruleTargets: [],
    bookings: new Map(),
    nextBookingId: 1,
    selections: [],
    tokenIndex: new Map(),
    refIndex: new Map(),
    countsByItemDate: new Map(),
    countsByOccurrence: new Map(),
  };
}

function installStubs(fx) {
  require.cache[poolPath] = makeStub(poolPath, {
    pool: {},
    async withTransaction(fn) { return fn({ __tx: true }); },
  });

  require.cache[eventModelPath] = makeStub(eventModelPath, {
    async findById(id) { return fx.events.get(Number(id)) || null; },
    async findByCode(code) {
      for (const ev of fx.events.values()) if (ev.code === code) return ev;
      return null;
    },
  });

  require.cache[calendarConfigModelPath] = makeStub(calendarConfigModelPath, {
    async findByEventId(eventId) { return fx.configs.get(Number(eventId)) || null; },
    async findById(id) {
      for (const cfg of fx.configs.values()) if (cfg.id === id) return cfg;
      return null;
    },
    async create() { return null; },
    async update() { return null; },
  });

  require.cache[calendarItemModelPath] = makeStub(calendarItemModelPath, {
    async findById(id) { return fx.items.get(Number(id)) || null; },
    async listForEvent(eventId, { includeArchived = false } = {}) {
      const out = [];
      for (const it of fx.items.values()) {
        if (Number(it.event_id) !== Number(eventId)) continue;
        if (!includeArchived && it.status !== 'active') continue;
        out.push(it);
      }
      out.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
      return out;
    },
    async listForConfig() { return []; },
  });

  require.cache[calendarOccurrenceModelPath] = makeStub(calendarOccurrenceModelPath, {
    async findById(id) { return fx.occurrences.get(Number(id)) || null; },
    async listForItem(itemId, { includeArchived = false } = {}) {
      const out = [];
      for (const o of fx.occurrences.values()) {
        if (Number(o.item_id) !== Number(itemId)) continue;
        if (!includeArchived && o.status !== 'active') continue;
        out.push(o);
      }
      return out;
    },
    async listForItemInRange(itemId, start, end) {
      const out = [];
      for (const o of fx.occurrences.values()) {
        if (Number(o.item_id) !== Number(itemId)) continue;
        if (o.status !== 'active') continue;
        const d = String(o.service_date).slice(0, 10);
        if (d >= start && d <= end) out.push(o);
      }
      return out;
    },
  });

  require.cache[calendarRuleModelPath] = makeStub(calendarRuleModelPath, {
    async findById(id) { return fx.rules.get(Number(id)) || null; },
    async listForConfig(configId) {
      const out = [];
      for (const r of fx.rules.values()) {
        if (Number(r.calendar_config_id) === Number(configId)) out.push(r);
      }
      return out;
    },
    async listTargets(ruleId) {
      return fx.ruleTargets.filter((t) => Number(t.rule_id) === Number(ruleId));
    },
  });

  require.cache[calendarBookingModelPath] = makeStub(calendarBookingModelPath, {
    async findById(id) { return fx.bookings.get(Number(id)) || null; },
    async findByConfirmationRef(ref) { return fx.refIndex.get(ref) || null; },
    async findBySubmissionToken(token) { return fx.tokenIndex.get(token) || null; },
    async listForEvent(eventId) {
      const out = [];
      for (const b of fx.bookings.values()) {
        if (Number(b.event_id) === Number(eventId)) out.push(b);
      }
      return out;
    },
    async listSelections(bookingId) {
      return fx.selections.filter((s) => Number(s.booking_id) === Number(bookingId));
    },
    async createBooking(attrs) {
      const id = fx.nextBookingId++;
      const row = {
        id,
        event_id: attrs.event_id,
        calendar_config_id: attrs.calendar_config_id,
        confirmation_ref: attrs.confirmation_ref,
        submission_token: attrs.submission_token,
        registrant: attrs.registrant,
        notes: attrs.notes,
        email: attrs.email,
        confirmation_meta: attrs.confirmation_meta || {},
        status: attrs.status || 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      fx.bookings.set(id, row);
      if (attrs.submission_token) fx.tokenIndex.set(attrs.submission_token, row);
      if (attrs.confirmation_ref) fx.refIndex.set(attrs.confirmation_ref, row);
      return row;
    },
    async createSelection(attrs) {
      const sel = { id: fx.selections.length + 1, ...attrs };
      fx.selections.push(sel);
      return sel;
    },
    async cancel(id) {
      const cur = fx.bookings.get(Number(id));
      if (!cur) return null;
      cur.status = 'canceled';
      cur.updated_at = new Date();
      return cur;
    },
    async countActiveForItemDate(itemId, date) {
      return fx.countsByItemDate.get(`${itemId}:${date}`) || 0;
    },
    async countActiveForOccurrence(occId) {
      return fx.countsByOccurrence.get(Number(occId)) || 0;
    },
  });
}

function freshApp() {
  delete require.cache[require.resolve('../../src/app')];
  // eslint-disable-next-line global-require
  const { createApp } = require('../../src/app');
  return createApp({ sessionStore: new MemoryStore() });
}

class MemoryStore extends session.Store {
  constructor() { super(); this.sessions = new Map(); }
  get(sid, cb) { cb(null, this.sessions.get(sid) || null); }
  set(sid, sess, cb) { this.sessions.set(sid, sess); cb && cb(null); }
  destroy(sid, cb) { this.sessions.delete(sid); cb && cb(null); }
  touch(_sid, _sess, cb) { cb && cb(null); }
}

function flattenForm(obj, prefix = '', out = []) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      for (const el of v) {
        if (el !== undefined && el !== null && el !== '') out.push([key, String(el)]);
      }
    } else if (v !== null && typeof v === 'object') {
      flattenForm(v, key, out);
    } else if (v !== undefined && v !== null && v !== '') {
      out.push([key, String(v)]);
    }
  }
  return out;
}

// HTTP client that preserves a single connection's session cookie across
// requests by passing back the cookie header. Returns a tiny client object
// with a .request(...) method.
function makeClient(app) {
  let cookieJar = '';
  return {
    async request({ method = 'GET', path: urlPath, headers = {}, body = null } = {}) {
      return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, () => {
          const { port } = server.address();
          const reqHeaders = { ...headers };
          if (cookieJar) reqHeaders.cookie = cookieJar;
          let payload = null;
          if (body !== null) {
            payload = typeof body === 'string'
              ? body
              : new URLSearchParams(flattenForm(body)).toString();
            reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/x-www-form-urlencoded';
            reqHeaders['content-length'] = Buffer.byteLength(payload).toString();
          }
          const opts = { host: '127.0.0.1', port, method, path: urlPath, headers: reqHeaders };
          const req = http.request(opts, (res) => {
            // Capture set-cookie header to preserve the session id across
            // subsequent requests in the same test.
            const setCookie = res.headers['set-cookie'];
            if (setCookie && setCookie.length) {
              cookieJar = setCookie.map((c) => c.split(';')[0]).join('; ');
            }
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
    },
  };
}

module.exports = {
  buildFixtures,
  installStubs,
  freshApp,
  MemoryStore,
  makeClient,
  flattenForm,
};
