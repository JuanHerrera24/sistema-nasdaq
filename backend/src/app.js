// Aplicación Express (capa de lógica de negocio expuesta como API REST).
// Se separa de server.js para poder usarla en: servidor local, Vercel y pruebas automatizadas.
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const stockRoutes = require('./routes/stockRoutes');
const repo = require('./repositories/stockRepository');

const app = express();

// Detrás de un proxy (Vercel) la IP real llega en X-Forwarded-For
app.set('trust proxy', 1);

// --- Seguridad ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120 }));

// --- API REST ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', dataStore: repo.mode, time: new Date().toISOString() }));
app.use('/api', stockRoutes);

// --- FRONTEND (capa de presentación) servido como archivos estáticos ---
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// --- Manejo central de errores ---
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'Error interno del servidor' : err.message });
});

module.exports = app;
