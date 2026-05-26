'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const refs = require('../../src/services/calendarReferences');

test('generateConfirmationRef returns a long URL-safe opaque string', () => {
  const a = refs.generateConfirmationRef();
  assert.equal(typeof a, 'string');
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 32, `expected length >= 32, got ${a.length}`);
});

test('generateConfirmationRef returns non-sequential, distinct values', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const v = refs.generateConfirmationRef();
    assert.ok(!seen.has(v), 'collisions are statistically impossible');
    seen.add(v);
  }
});

test('isValidConfirmationRefShape accepts generated refs and rejects garbage', () => {
  const v = refs.generateConfirmationRef();
  assert.equal(refs.isValidConfirmationRefShape(v), true);
  assert.equal(refs.isValidConfirmationRefShape('short'), false);
  assert.equal(refs.isValidConfirmationRefShape(''), false);
  assert.equal(refs.isValidConfirmationRefShape(null), false);
  assert.equal(refs.isValidConfirmationRefShape('has spaces here in token'), false);
});

test('generateSubmissionToken returns an opaque distinct string', () => {
  const a = refs.generateSubmissionToken();
  const b = refs.generateSubmissionToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});
