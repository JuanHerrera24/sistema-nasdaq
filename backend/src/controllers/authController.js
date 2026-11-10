// Controladores de autenticación: registro, inicio de sesión y usuario actual
const auth = require('../services/authService');
const repo = require('../repositories/stockRepository');

// Usuario de demostración para presentar el sistema (configurable con DEMO_EMAIL / DEMO_PASSWORD)
const DEMO = {
  fullName: 'Usuario Demo',
  email: (process.env.DEMO_EMAIL || 'demo@nasdaq.com').toLowerCase(),
  password: process.env.DEMO_PASSWORD || 'Demo2026',
};

async function ensureDemoUser() {
  if (process.env.DEMO_DISABLED === 'true' || (await repo.findUserByEmail(DEMO.email))) return;
  try {
    await repo.createUser({ fullName: DEMO.fullName, email: DEMO.email, passwordHash: auth.hashPassword(DEMO.password), role: 'admin' });
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
}

const publicUser = (u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role });

// POST /api/auth/register { fullName, email, password }
async function register(req, res) {
  const data = auth.validateRegistration(req.body);
  if (await repo.findUserByEmail(data.email)) throw auth.httpError(409, 'Ya existe una cuenta con ese correo');
  let user;
  try {
    user = await repo.createUser({ fullName: data.fullName, email: data.email, passwordHash: auth.hashPassword(data.password) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw auth.httpError(409, 'Ya existe una cuenta con ese correo');
    throw err;
  }
  res.status(201).json({ token: auth.signToken(user), user: publicUser(user) });
}

// POST /api/auth/login { email, password }
async function login(req, res) {
  await ensureDemoUser();
  const email = auth.validateEmail(req.body?.email);
  const user = await repo.findUserByEmail(email);
  // Mismo mensaje si el correo no existe o la clave es incorrecta (no revela qué cuentas existen)
  if (!user || !auth.verifyPassword(req.body?.password, user.passwordHash)) {
    throw auth.httpError(401, 'Correo o contraseña incorrectos');
  }
  await repo.touchLogin(user.id);
  res.json({ token: auth.signToken(user), user: publicUser(user) });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: { id: req.user.sub, fullName: req.user.name, email: req.user.email, role: req.user.role } });
}

// Middleware: exige "Authorization: Bearer <token>"
function requireAuth(req, res, next) {
  try {
    const [type, token] = String(req.headers.authorization || '').split(' ');
    if (type !== 'Bearer' || !token) throw auth.httpError(401, 'Debe iniciar sesión');
    req.user = auth.verifyToken(token);
    next();
  } catch (err) {
    next(err.status ? err : auth.httpError(401, 'Sesión inválida, inicie sesión de nuevo'));
  }
}

module.exports = { register, login, me, requireAuth, ensureDemoUser, DEMO };
