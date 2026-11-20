import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegisterPayload, loginSchema, registerSchema } from './authSchemas';

test('loginSchema rejects invalid email or empty password', () => {
  const bad = loginSchema.safeParse({ email: 'bukan-email', password: '' });
  assert.equal(bad.success, false);

  const ok = loginSchema.safeParse({ email: ' user@contoh.id ', password: 'secret123' });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.email, 'user@contoh.id');
  }
});

test('registerSchema enforces matching confirmation password and optional family name', () => {
  const mismatch = registerSchema.safeParse({
    name: 'Budi Santoso',
    email: 'budi@contoh.id',
    family_name: 'Keluarga Santoso',
    password: 'password123',
    confirm_password: 'password456',
  });
  assert.equal(mismatch.success, false);

  const validPrivate = registerSchema.safeParse({
    name: 'Budi Santoso',
    email: 'Budi@Contoh.id',
    family_name: '   ',
    password: 'password123',
    confirm_password: 'password123',
  });
  assert.equal(validPrivate.success, true);
  if (validPrivate.success) {
    const payload = buildRegisterPayload(validPrivate.data);
    assert.equal(payload.email, 'budi@contoh.id');
    assert.equal('family_name' in payload, false);
  }
});
