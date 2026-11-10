// Pruebas automatizadas del login de punta a punta (registro, inicio de sesión y rutas protegidas)
process.env.DATA_STORE = 'memory';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../../src/app');
const repo = require('../../src/repositories/stockRepository');
const { DEMO } = require('../../src/controllers/authController');

let base;
let server;

test.before(async () => {
  repo.reset();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const ana = { fullName: 'Ana Pérez', email: 'ana@correo.com', password: 'Segura2026' };

test('Las rutas de la API exigen iniciar sesión (401 sin token)', async () => {
  const res = await fetch(`${base}/api/stocks`);
  assert.strictEqual(res.status, 401);
  assert.match((await res.json()).error, /iniciar sesión/);
});

test('POST /api/auth/register crea la cuenta y devuelve un token', async () => {
  const res = await post('/api/auth/register', ana);
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body.token.split('.').length === 3);
  assert.deepStrictEqual(body.user, { id: body.user.id, fullName: 'Ana Pérez', email: 'ana@correo.com', role: 'analista' });
  assert.ok(!('passwordHash' in body.user));
  const stored = await repo.findUserByEmail('ana@correo.com');
  assert.ok(!stored.passwordHash.includes(ana.password), 'la contraseña no debe guardarse en texto plano');
});

test('No permite registrar dos veces el mismo correo (409)', async () => {
  const res = await post('/api/auth/register', { ...ana, email: 'ANA@correo.com' });
  assert.strictEqual(res.status, 409);
});

test('Rechaza contraseñas débiles al registrarse (400)', async () => {
  const res = await post('/api/auth/register', { ...ana, email: 'otro@correo.com', password: '123' });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/login con datos correctos da acceso a la API', async () => {
  const res = await post('/api/auth/login', { email: ana.email, password: ana.password });
  assert.strictEqual(res.status, 200);
  const { token } = await res.json();
  const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(me.status, 200);
  assert.strictEqual((await me.json()).user.email, 'ana@correo.com');
});

test('Login con contraseña incorrecta o correo inexistente responde 401 con el mismo mensaje', async () => {
  const wrong = await post('/api/auth/login', { email: ana.email, password: 'Incorrecta1' });
  const missing = await post('/api/auth/login', { email: 'nadie@correo.com', password: 'Incorrecta1' });
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(missing.status, 401);
  assert.strictEqual((await wrong.json()).error, (await missing.json()).error);
});

test('El usuario demo puede iniciar sesión', async () => {
  const res = await post('/api/auth/login', { email: DEMO.email, password: DEMO.password });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).user.role, 'admin');
});

test('Un token alterado no da acceso (401)', async () => {
  const res = await fetch(`${base}/api/auth/me`, { headers: { Authorization: 'Bearer aaa.bbb.ccc' } });
  assert.strictEqual(res.status, 401);
});

test('Bloquea la fuerza bruta: más de 10 intentos por minuto responde 429', async () => {
  let status;
  for (let i = 0; i < 12; i++) status = (await post('/api/auth/login', { email: ana.email, password: `Mala${i}xx` })).status;
  assert.strictEqual(status, 429);
});
