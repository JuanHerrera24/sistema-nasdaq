// Punto de entrada del BACKEND en un servidor tradicional (equipo local)
require('dotenv').config();
const app = require('./app');
const repo = require('./repositories/stockRepository');
const { startScheduler } = require('./jobs/scheduler');

const PORT = Number(process.env.PORT || 3000);

async function start() {
  if (repo.mode === 'mysql') {
    try {
      await require('./config/db').testConnection();
      console.log('[DB] Conectado a MySQL');
    } catch (err) {
      console.error(`[DB] No se pudo conectar a MySQL: ${err.message || err.code}`);
      console.error('     Revise el archivo backend/.env y que el servicio MySQL esté encendido.');
      process.exit(1);
    }
  } else {
    console.log('[DB] Sin DB_HOST: usando almacenamiento en memoria');
  }
  app.listen(PORT, () => {
    console.log(`[API] Servidor en http://localhost:${PORT}`);
    startScheduler();
  });
}

start();
