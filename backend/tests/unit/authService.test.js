// Pruebas unitarias de la autenticación (contraseñas, tokens y validaciones)
process.env.JWT_SECRET = 'secreto-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const auth = require('../../src/services/authService');

const user = { id: 7, email: 'ana@correo.com', fullName: 'Ana Pérez', role: 'analista' };

test('hashPassword nunca guarda la contraseña en texto plano y usa sal aleatoria', () => {
  const a = auth.hashPassword('Clave2026');
  const b = auth.hashPassword('Clave2026');
  assert.ok(!a.includes('Clave2026'));
  assert.match(a, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notStrictEqual(a, b);
});

test('verifyPassword acepta la clave correcta y rechaza las incorrectas', () => {
  const h = auth.hashPassword('Clave2026');
  assert.strictEqual(auth.verifyPassword('Clave2026', h), true);
  assert.strictEqual(auth.verifyPassword('clave2026', h), false);
  assert.strictEqual(auth.verifyPassword('Clave2026', 'texto-plano'), false);
  assert.strictEqual(auth.verifyPassword(undefined, h), false);
});

test('signToken / verifyToken: el token contiene el usuario y expira en 8 horas', () => {
  const payload = auth.verifyToken(auth.signToken(user));
  assert.strictEqual(payload.sub, 7);
  assert.strictEqual(payload.email, 'ana@correo.com');
  assert.strictEqual(payload.exp - payload.iat, 8 * 3600);
});

test('verifyToken rechaza tokens alterados', () => {
  const [h, , s] = auth.signToken(user).split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 1, role: 'admin', exp: 9999999999 })).toString('base64url');
  assert.throws(() => auth.verifyToken(`${h}.${forged}.${s}`), (e) => e.status === 401);
  assert.throws(() => auth.verifyToken('basura'), (e) => e.status === 401);
});

test('verifyToken rechaza tokens expirados', (t) => {
  const token = auth.signToken(user);
  t.mock.method(Date, 'now', () => Date.prototype.valueOf.call(new Date()) + 9 * 3600 * 1000);
  assert.throws(() => auth.verifyToken(token), /expiró/);
});

test('validateRegistration normaliza los datos válidos', () => {
  const r = auth.validateRegistration({ fullName: '  Juan   Pérez ', email: 'JUAN@Correo.COM ', password: 'Segura123' });
  assert.deepStrictEqual(r, { fullName: 'Juan Pérez', email: 'juan@correo.com', password: 'Segura123' });
});

test('validateRegistration rechaza nombre, correo o contraseña inválidos', () => {
  const ok = { fullName: 'Juan Pérez', email: 'juan@correo.com', password: 'Segura123' };
  for (const bad of [
    { fullName: 'J' },
    { fullName: 'x'.repeat(81) },
    { email: 'sin-arroba' },
    { email: `${'a'.repeat(120)}@correo.com` },
    { password: 'corta1' },
    { password: 'sololetras' },
    { password: '12345678' },
  ]) {
    assert.throws(() => auth.validateRegistration({ ...ok, ...bad }), (e) => e.status === 400, JSON.stringify(bad));
  }
});
