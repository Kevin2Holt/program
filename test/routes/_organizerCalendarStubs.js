'use strict';

// Shared stubs + helpers for organizer calendar route integration tests.
// Mirrors the technique in organizerSetupRoute.test.js: we hijack
// require.cache for the model + auth layers, then drive the real Express
// app over HTTP. This keeps the tests fast and DB-free.

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
const requireAuthPath = require.resolve('../../src/middleware/requireAuth');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function buildFixtures() {
  const events = new Map();
  events.set(42, { id: 42, code: 'cal26', title: 'Test event', owner_id: 1 });

  const configs = new Map(); // by event_id
  configs.set(42, {
    id: 1,
    event_id: 42,
    title: 'Calendar',
    enabled: true,
    public_visibility_state: 'published',
    date_window_mode: 'fixed',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
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

  const items = new Map();       // by id
  let nextItemId = 1;
  const occurrences = new Map(); // by id
  let nextOccurrenceId = 1;
  const rules = new Map();       // by id
  let nextRuleId = 1;
  const ruleTargets = []; // [{rule_id, item_id}]

  return {
    events,
    configs,
    items, nextItemId() { return nextItemId++; },
    occurrences, nextOccurrenceId() { return nextOccurrenceId++; },
    rules, nextRuleId() { return nextRuleId++; },
    ruleTargets,
  };
}

function installStubs(fx, { authUser = { id: 1, email: 'org@test' } } = {}) {
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
    async create(eventId) {
      const row = {
        id: fx.configs.size + 1,
        event_id: Number(eventId),
        title: 'Calendar', enabled: false,
        public_visibility_state: 'draft',
        date_window_mode: 'fixed',
        fixed_start_date: null, fixed_end_date: null,
        rolling_window_unit: null, rolling_window_size: null,
        time_behavior_mode: 'date_only',
        event_time_zone: 'UTC',
        notes_enabled: false, email_confirmation_enabled: false,
        add_to_calendar_enabled: false,
        calendar_export_mode: 'combined',
        form_config: {}, export_defaults: {},
        created_at: new Date(), updated_at: new Date(),
      };
      fx.configs.set(Number(eventId), row);
      return row;
    },
    async update(id, patch) {
      for (const [eventId, cfg] of fx.configs.entries()) {
        if (cfg.id === id) {
          const merged = { ...cfg, ...patch, updated_at: new Date() };
          fx.configs.set(eventId, merged);
          return merged;
        }
      }
      return null;
    },
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
    async create(attrs) {
      const id = fx.nextItemId();
      const row = {
        id,
        calendar_config_id: attrs.calendar_config_id,
        event_id: Number(attrs.event_id),
        name: attrs.name,
        capacity: attrs.capacity,
        color: attrs.color,
        shape: attrs.shape,
        sort_order: attrs.sort_order || 0,
        status: attrs.status || 'active',
        created_at: new Date(), updated_at: new Date(),
      };
      fx.items.set(id, row);
      return row;
    },
    async update(id, patch) {
      const cur = fx.items.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, ...patch, updated_at: new Date() };
      fx.items.set(Number(id), next);
      return next;
    },
    async archive(id) {
      const cur = fx.items.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, status: 'archived', updated_at: new Date() };
      fx.items.set(Number(id), next);
      return next;
    },
    async unarchive(id) {
      const cur = fx.items.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, status: 'active', updated_at: new Date() };
      fx.items.set(Number(id), next);
      return next;
    },
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
    async create(attrs) {
      const id = fx.nextOccurrenceId();
      const row = {
        id,
        item_id: Number(attrs.item_id),
        service_date: attrs.service_date,
        start_time: attrs.start_time || null,
        end_time: attrs.end_time || null,
        duration_minutes: attrs.duration_minutes ?? null,
        label: attrs.label || null,
        capacity_override: attrs.capacity_override ?? null,
        status: 'active',
        created_at: new Date(), updated_at: new Date(),
      };
      fx.occurrences.set(id, row);
      return row;
    },
    async update(id, patch) {
      const cur = fx.occurrences.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, ...patch, updated_at: new Date() };
      fx.occurrences.set(Number(id), next);
      return next;
    },
    async archive(id) {
      const cur = fx.occurrences.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, status: 'archived', updated_at: new Date() };
      fx.occurrences.set(Number(id), next);
      return next;
    },
    async deactivate(id) {
      const cur = fx.occurrences.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, status: 'archived', updated_at: new Date() };
      fx.occurrences.set(Number(id), next);
      return next;
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
    async create(attrs) {
      const id = fx.nextRuleId();
      const row = {
        id,
        calendar_config_id: Number(attrs.calendar_config_id),
        rule_type: attrs.rule_type,
        target_scope: attrs.target_scope,
        active: attrs.active !== false,
        blocked_date: attrs.blocked_date || null,
        recurrence_pattern: attrs.recurrence_pattern || null,
        recurrence_detail: attrs.recurrence_detail || {},
        recurrence_start_date: attrs.recurrence_start_date || null,
        recurrence_end_date: attrs.recurrence_end_date || null,
        reason: attrs.reason || null,
        created_at: new Date(), updated_at: new Date(),
      };
      fx.rules.set(id, row);
      return row;
    },
    async update(id, patch) {
      const cur = fx.rules.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, ...patch, updated_at: new Date() };
      fx.rules.set(Number(id), next);
      return next;
    },
    async deactivate(id) {
      const cur = fx.rules.get(Number(id));
      if (!cur) return null;
      const next = { ...cur, active: false, updated_at: new Date() };
      fx.rules.set(Number(id), next);
      return next;
    },
    async addTargets(ruleId, itemIds) {
      for (const itemId of itemIds || []) {
        fx.ruleTargets.push({ rule_id: Number(ruleId), item_id: Number(itemId) });
      }
    },
    async clearTargets(ruleId) {
      for (let i = fx.ruleTargets.length - 1; i >= 0; i -= 1) {
        if (Number(fx.ruleTargets[i].rule_id) === Number(ruleId)) fx.ruleTargets.splice(i, 1);
      }
    },
  });

  require.cache[calendarBookingModelPath] = makeStub(calendarBookingModelPath, {
    async listForEvent() { return []; },
  });

  require.cache[requireAuthPath] = makeStub(requireAuthPath, function passAuth(req, _res, next) {
    req.user = authUser;
    return next();
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

function request(app, { method = 'GET', path: urlPath, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      const opts = {
        host: '127.0.0.1', port, method, path: urlPath, headers: { ...headers },
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

module.exports = {
  buildFixtures,
  installStubs,
  freshApp,
  MemoryStore,
  request,
  flattenForm,
};
