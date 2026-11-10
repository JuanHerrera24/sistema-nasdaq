const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Frena ataques de fuerza bruta: 10 intentos por minuto por IP
const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, message: { error: 'Demasiados intentos, espere un minuto' } });

router.post('/register', authLimiter, wrap(c.register));
router.post('/login', authLimiter, wrap(c.login));
router.get('/me', c.requireAuth, wrap(c.me));

module.exports = router;
