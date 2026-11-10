// Autenticación: contraseñas con scrypt (sal aleatoria) y tokens firmados con HMAC-SHA256 (formato JWT).
// Solo usa el módulo `crypto` de Node, sin dependencias externas.
const crypto = require('crypto');

const TOKEN_HOURS = 8;
let warned = false;

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!warned) {
    console.warn('[AUTH] JWT_SECRET no definido: se usa un secreto temporal (las sesiones se pierden al reiniciar)');
    warned = true;
  }
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  return process.env.JWT_SECRET;
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------- Contraseñas ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

// ---------------- Tokens ----------------
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, email: user.email, name: user.fullName, role: user.role, iat: now, exp: now + TOKEN_HOURS * 3600 };
  const data = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
  return `${data}.${sign(data)}`;
}

function verifyToken(token) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) throw httpError(401, 'Sesión inválida, inicie sesión de nuevo');
  const expected = Buffer.from(sign(`${header}.${body}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw httpError(401, 'Sesión inválida, inicie sesión de nuevo');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now() / 1000) throw httpError(401, 'La sesión expiró, inicie sesión de nuevo');
  return payload;
}

// ---------------- Validaciones (mismos límites que la tabla users) ----------------
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (e.length > 120 || !EMAIL_REGEX.test(e)) throw httpError(400, 'Correo electrónico inválido');
  return e;
}

function validateRegistration({ fullName, email, password } = {}) {
  const name = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) throw httpError(400, 'El nombre debe tener entre 3 y 80 caracteres');
  const pwd = String(password || '');
  if (pwd.length < 8 || pwd.length > 72 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
    throw httpError(400, 'La contraseña debe tener entre 8 y 72 caracteres e incluir letras y números');
  }
  return { fullName: name, email: validateEmail(email), password: pwd };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, validateEmail, validateRegistration, httpError };
