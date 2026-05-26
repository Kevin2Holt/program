'use strict';

// Unit tests for calendarItemService.parseAndValidateForm + product-rule
// constants. These tests do not touch the database — they exercise the pure
// form-parsing branch organizers hit on every submit.

const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../../src/services/calendarItemService');

test('COLOR_PALETTE and SHAPE_SET are frozen, non-empty, and unique', () => {
  assert.ok(Object.isFrozen(svc.COLOR_PALETTE));
  assert.ok(Object.isFrozen(svc.SHAPE_SET));
  assert.ok(svc.COLOR_PALETTE.length >= 4);
  assert.ok(svc.SHAPE_SET.length >= 4);
  assert.equal(new Set(svc.COLOR_PALETTE).size, svc.COLOR_PALETTE.length);
  assert.equal(new Set(svc.SHAPE_SET).size, svc.SHAPE_SET.length);
});

test('parseAndValidateForm: valid create body returns a clean patch', () => {
  const { patch, errors } = svc.parseAndValidateForm({
    name: '  Salmon  ',
    capacity: '8',
    color: svc.COLOR_PALETTE[2],
    shape: svc.SHAPE_SET[3],
    sort_order: '5',
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.name, 'Salmon');
  assert.equal(patch.capacity, 8);
  assert.equal(patch.color, svc.COLOR_PALETTE[2]);
  assert.equal(patch.shape, svc.SHAPE_SET[3]);
  assert.equal(patch.sort_order, 5);
});

test('parseAndValidateForm: defaults capacity/color/shape/sort_order on create', () => {
  const { patch, errors } = svc.parseAndValidateForm({ name: 'Mac & Cheese' });
  assert.deepEqual(errors, []);
  assert.equal(patch.capacity, 1);
  assert.equal(patch.color, svc.DEFAULT_COLOR);
  assert.equal(patch.shape, svc.DEFAULT_SHAPE);
  assert.equal(patch.sort_order, 0);
});

test('parseAndValidateForm: name is required and is bounded', () => {
  const { errors } = svc.parseAndValidateForm({ name: '' });
  assert.ok(errors.some((e) => e.field === 'name'));

  const long = 'x'.repeat(svc.MAX_NAME_LEN + 1);
  const r2 = svc.parseAndValidateForm({ name: long });
  assert.ok(r2.errors.some((e) => e.field === 'name'));
});

test('parseAndValidateForm: capacity must be a positive integer within bounds', () => {
  const a = svc.parseAndValidateForm({ name: 'A', capacity: '0' });
  assert.ok(a.errors.some((e) => e.field === 'capacity'));

  const b = svc.parseAndValidateForm({ name: 'A', capacity: '-2' });
  assert.ok(b.errors.some((e) => e.field === 'capacity'));

  const c = svc.parseAndValidateForm({ name: 'A', capacity: '3.14' });
  assert.ok(c.errors.some((e) => e.field === 'capacity'));

  const d = svc.parseAndValidateForm({ name: 'A', capacity: String(svc.MAX_CAPACITY + 1) });
  assert.ok(d.errors.some((e) => e.field === 'capacity'));
});

test('parseAndValidateForm: color must come from the bounded palette', () => {
  const { errors } = svc.parseAndValidateForm({ name: 'A', color: '#000000' });
  assert.ok(errors.some((e) => e.field === 'color'));
});

test('parseAndValidateForm: shape must come from the bounded set', () => {
  const { errors } = svc.parseAndValidateForm({ name: 'A', shape: 'Z' });
  assert.ok(errors.some((e) => e.field === 'shape'));
});

test('parseAndValidateForm: sort_order is optional but must be an integer when provided', () => {
  const ok = svc.parseAndValidateForm({ name: 'A', sort_order: '' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.patch.sort_order, 0);

  const bad = svc.parseAndValidateForm({ name: 'A', sort_order: '1.5' });
  assert.ok(bad.errors.some((e) => e.field === 'sort_order'));
});

test('parseAndValidateForm: edit mode does not invent defaults for capacity/color/shape', () => {
  const { patch, errors } = svc.parseAndValidateForm(
    { name: 'A', capacity: '4', color: svc.COLOR_PALETTE[0], shape: svc.SHAPE_SET[0] },
    { isCreate: false },
  );
  assert.deepEqual(errors, []);
  assert.equal(patch.capacity, 4);
  assert.ok(!Object.prototype.hasOwnProperty.call(patch, 'sort_order'));
});

test('parseAndValidateForm: edit mode requires capacity/color/shape when missing', () => {
  const { errors } = svc.parseAndValidateForm({ name: 'A' }, { isCreate: false });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('capacity'));
  assert.ok(fields.includes('color'));
  assert.ok(fields.includes('shape'));
});
