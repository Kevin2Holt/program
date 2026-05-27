'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub userModel + passwordService before requiring authService.
const userModelPath = require.resolve('../../src/models/user');
const passwordServicePath = require.resolve('../../src/services/passwordService');
const authServicePath = require.resolve('../../src/services/authService');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function loadFresh({ users = [], passwordOk = true } = {}) {
  const usersByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  let nextId = users.length + 1;
  require.cache[userModelPath] = makeStub(userModelPath, {
    async findById(id) { return users.find((u) => u.id === Number(id)) || null; },
    async findByEmail(email) { return usersByEmail.get(String(email).toLowerCase()) || null; },
    async create({ email, displayName, passwordHash }) {
      const row = {
        id: nextId++, email, display_name: displayName, password_hash: passwordHash,
      };
      users.push(row);
      usersByEmail.set(email.toLowerCase(), row);
      return row;
    },
  });
  require.cache[passwordServicePath] = makeStub(passwordServicePath, {
    async hash() { return 'scrypt$stub'; },
    async verify() { return passwordOk; },
  });
  delete require.cache[authServicePath];
  return require('../../src/services/authService');
}

test('signup rejects invalid email', async () => {
  const svc = loadFresh();
  await assert.rejects(
    () => svc.signup({ email: 'not-an-email', password: 'longenough', passwordConfirm: 'longenough' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.email),
  );
});

test('signup rejects short password', async () => {
  const svc = loadFresh();
  await assert.rejects(
    () => svc.signup({ email: 'a@b.test', password: 'short', passwordConfirm: 'short' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.password),
  );
});

test('signup rejects mismatched confirmation', async () => {
  const svc = loadFresh();
  await assert.rejects(
    () => svc.signup({ email: 'a@b.test', password: 'longenough', passwordConfirm: 'different!' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.passwordConfirm),
  );
});

test('signup rejects duplicate email', async () => {
  const svc = loadFresh({
    users: [{ id: 1, email: 'taken@example.com', display_name: null, password_hash: 'h' }],
  });
  await assert.rejects(
    () => svc.signup({ email: 'taken@example.com', password: 'longenough', passwordConfirm: 'longenough' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField.email),
  );
});

test('signup creates a user when input is valid', async () => {
  const svc = loadFresh();
  const user = await svc.signup({
    email: 'New@Example.Com',
    password: 'longenough',
    passwordConfirm: 'longenough',
    displayName: '  Alice  ',
  });
  assert.equal(user.email, 'New@Example.Com');
  assert.equal(user.display_name, 'Alice');
  assert.equal(user.password_hash, 'scrypt$stub');
});

test('login returns user when password matches', async () => {
  const svc = loadFresh({
    users: [{ id: 1, email: 'a@b.test', display_name: null, password_hash: 'scrypt$stub' }],
    passwordOk: true,
  });
  const user = await svc.login({ email: 'a@b.test', password: 'whatever' });
  assert.equal(user.id, 1);
});

test('login rejects wrong password', async () => {
  const svc = loadFresh({
    users: [{ id: 1, email: 'a@b.test', display_name: null, password_hash: 'scrypt$stub' }],
    passwordOk: false,
  });
  await assert.rejects(
    () => svc.login({ email: 'a@b.test', password: 'whatever' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField._form),
  );
});

test('login rejects unknown email with the same generic message', async () => {
  const svc = loadFresh();
  await assert.rejects(
    () => svc.login({ email: 'nobody@example.com', password: 'whatever' }),
    (err) => err.code === 'VALIDATION' && Boolean(err.errorsByField._form),
  );
});

test('login rejects empty inputs', async () => {
  const svc = loadFresh();
  await assert.rejects(
    () => svc.login({ email: '', password: '' }),
    (err) => err.code === 'VALIDATION',
  );
});
