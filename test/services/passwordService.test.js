'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const passwordService = require('../../src/services/passwordService');

test('hash produces a parseable scrypt$... string', async () => {
  const h = await passwordService.hash('hunter22!');
  assert.match(h, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
});

test('verify accepts the correct password', async () => {
  const h = await passwordService.hash('correct horse battery staple');
  assert.equal(await passwordService.verify('correct horse battery staple', h), true);
});

test('verify rejects the wrong password', async () => {
  const h = await passwordService.hash('alpha');
  assert.equal(await passwordService.verify('beta', h), false);
});

test('verify rejects malformed encoded strings', async () => {
  assert.equal(await passwordService.verify('x', 'not-a-hash'), false);
  assert.equal(await passwordService.verify('x', 'scrypt$1$1$1$$'), false);
  assert.equal(await passwordService.verify('x', ''), false);
});

test('hash rejects empty passwords', async () => {
  await assert.rejects(() => passwordService.hash(''));
  await assert.rejects(() => passwordService.hash(null));
});
