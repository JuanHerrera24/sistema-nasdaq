const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/stockController');

const router = express.Router();

// Envuelve controladores async para enviar los errores al manejador central
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// La sincronización manual consume la API externa: se limita más
const syncLimiter = rateLimit({ windowMs: 60_000, limit: 3, message: { error: 'Demasiadas sincronizaciones, espere un minuto' } });

router.get('/stocks', wrap(c.dashboard));
router.get('/stocks/:symbol', wrap(c.detail));
router.post('/stocks', wrap(c.add));
router.delete('/stocks/:symbol', wrap(c.remove));
router.get('/live/:symbol', wrap(c.live));
router.post('/sync', syncLimiter, wrap(c.sync));
router.post('/simulate', wrap(c.simulate));

module.exports = router;
