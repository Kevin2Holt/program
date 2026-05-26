'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../../src/services/calendarExportService');

test('toCsv handles count-only detail level', () => {
  const csv = svc.toCsv({
    detailLevel: 'count_only',
    fields: [],
    rows: [],
    summary: { bookingCount: 5 },
  });
  assert.ok(csv.includes('count'));
  assert.ok(csv.includes('5'));
});

test('toCsv hides contact fields when detail level excludes them', () => {
  const csv = svc.toCsv({
    detailLevel: 'names_only',
    fields: ['name'],
    rows: [{
      booking: {
        id: 1, confirmation_ref: 'abc', registrant: { name: 'Alice', phone: '555' }, email: 'a@b',
      },
      selections: [{ selected_date: '2026-06-01', item_name_snapshot: 'Item A' }],
    }],
    summary: { bookingCount: 1 },
  });
  assert.ok(csv.includes('Alice'));
  assert.ok(!csv.includes('555'));
  assert.ok(!csv.includes('a@b'));
});

test('toCsv includes contact fields when explicitly requested', () => {
  const csv = svc.toCsv({
    detailLevel: 'names_and_contact',
    fields: ['name', 'phone', 'email'],
    rows: [{
      booking: {
        id: 1, confirmation_ref: 'abc', registrant: { name: 'Alice', phone: '555' }, email: 'a@b',
      },
      selections: [{ selected_date: '2026-06-01', item_name_snapshot: 'Item A' }],
    }],
    summary: { bookingCount: 1 },
  });
  assert.ok(csv.includes('Alice'));
  assert.ok(csv.includes('555'));
  assert.ok(csv.includes('a@b'));
});

test('toCsv properly escapes values containing commas and quotes', () => {
  const csv = svc.toCsv({
    detailLevel: 'names_only',
    fields: ['name'],
    rows: [{
      booking: { id: 1, confirmation_ref: 'r', registrant: { name: 'Doe, Jane "JD"' }, email: '' },
      selections: [{ selected_date: '2026-06-01', item_name_snapshot: 'Item' }],
    }],
    summary: { bookingCount: 1 },
  });
  assert.ok(csv.includes('"Doe, Jane ""JD"""'));
});
