'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const eventModelPath = require.resolve('../../src/models/event');
const reservedModelPath = require.resolve('../../src/models/reservedWord');
const poolPath = require.resolve('../../src/db/pool');
const svcPath = require.resolve('../../src/services/eventService');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function loadFresh({ existingCodes = [], reserved = [] } = {}) {
  const events = new Map();
  let nextId = 1;
  existingCodes.forEach((code) => {
    const id = nextId++;
    events.set(id, { id, code, title: '', owner_id: null });
  });

  const queries = [];
  const fakeClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };

  require.cache[poolPath] = makeStub(poolPath, {
    pool: {},
    async withTransaction(fn) { return fn(fakeClient); },
  });

  require.cache[eventModelPath] = makeStub(eventModelPath, {
    async findById(id) { return events.get(Number(id)) || null; },
    async findByCode(code) {
      for (const ev of events.values()) {
        if (String(ev.code).toLowerCase() === String(code).toLowerCase()) return ev;
      }
      return null;
    },
    async create({ code, title, ownerId }) {
      const id = nextId++;
      const row = { id, code, title, owner_id: ownerId, status: 'draft' };
      events.set(id, row);
      return row;
    },
  });

  require.cache[reservedModelPath] = makeStub(reservedModelPath, {
    async isReserved(word) {
      return reserved.map((s) => s.toLowerCase()).includes(String(word).toLowerCase());
    },
  });

  delete require.cache[svcPath];
  return { svc: require('../../src/services/eventService'), events, queries };
}

test('validateCodeShape enforces lowercase / hyphen / length rules', () => {
  const { svc } = loadFresh();
  assert.equal(svc.validateCodeShape('myparty'), null);
  assert.equal(svc.validateCodeShape('my-party-26'), null);
  assert.ok(svc.validateCodeShape(''));
  assert.ok(svc.validateCodeShape('ab'));
  assert.ok(svc.validateCodeShape('UPPER'));
  assert.ok(svc.validateCodeShape('-leading'));
  assert.ok(svc.validateCodeShape('trailing-'));
  assert.ok(svc.validateCodeShape('with space'));
  assert.ok(svc.validateCodeShape('under_score'));
  assert.ok(svc.validateCodeShape('a'.repeat(33)));
});

test('createEvent rejects reserved words', async () => {
  const { svc } = loadFresh({ reserved: ['admin'] });
  await assert.rejects(
    () => svc.createEvent({ userId: 1, code: 'admin', title: 'X' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.code),
  );
});

test('createEvent rejects duplicate codes (case-insensitive)', async () => {
  const { svc } = loadFresh({ existingCodes: ['party'] });
  await assert.rejects(
    () => svc.createEvent({ userId: 1, code: 'PARTY', title: 'X' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.code),
  );
});

test('createEvent rejects missing title', async () => {
  const { svc } = loadFresh();
  await assert.rejects(
    () => svc.createEvent({ userId: 1, code: 'party', title: '   ' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.title),
  );
});

test('createEvent rejects anonymous caller', async () => {
  const { svc } = loadFresh();
  await assert.rejects(
    () => svc.createEvent({ userId: null, code: 'party', title: 'X' }),
    (err) => err.status === 401,
  );
});

test('createEvent normalizes code, inserts event, and adds owner membership', async () => {
  const { svc, queries } = loadFresh();
  const event = await svc.createEvent({ userId: 7, code: '  MyParty  ', title: '  Hello  ' });
  assert.equal(event.code, 'myparty');
  assert.equal(event.title, 'Hello');
  assert.equal(event.owner_id, 7);
  // The member insert went through the same transactional client.
  const memberInsert = queries.find((q) => /INSERT INTO event_members/.test(q.sql));
  assert.ok(memberInsert, 'expected event_members insert');
  assert.deepEqual(memberInsert.params, [event.id, 7]);
});
