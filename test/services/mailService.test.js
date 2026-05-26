'use strict';

/* eslint-disable no-console */

const test = require('node:test');
const assert = require('node:assert/strict');

// Force a clean require of the service after twiddling env.
function loadFresh() {
  delete require.cache[require.resolve('../../src/services/mailService')];
  delete require.cache[require.resolve('../../src/config/env')];
  return require('../../src/services/mailService');
}

test('noop provider returns delivered=false but does not throw', async () => {
  delete process.env.EMAIL_PROVIDER;
  const mail = loadFresh();
  const res = await mail.sendMail({ to: 'a@b', subject: 'hi', text: 'x' });
  assert.equal(res.delivered, false);
  assert.equal(res.provider, 'noop');
});

test('log provider writes to console and reports delivered=true', async () => {
  process.env.EMAIL_PROVIDER = 'log';
  const mail = loadFresh();
  const originalLog = console.log;
  let captured = null;
  console.log = (...args) => { captured = args.join(' '); };
  try {
    const res = await mail.sendMail({ to: 'a@b', subject: 'hi', text: 'body' });
    assert.equal(res.delivered, true);
    assert.equal(res.provider, 'log');
    assert.match(captured, /mail:log/);
    assert.match(captured, /a@b/);
  } finally {
    console.log = originalLog;
    delete process.env.EMAIL_PROVIDER;
  }
});

test('sendMail rejects gracefully when to or subject missing', async () => {
  delete process.env.EMAIL_PROVIDER;
  const mail = loadFresh();
  const res = await mail.sendMail({ to: '', subject: 'x' });
  assert.equal(res.delivered, false);
  assert.ok(res.error);
});
