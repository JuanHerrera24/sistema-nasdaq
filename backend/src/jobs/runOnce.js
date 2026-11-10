// Ejecuta una sincronización manual desde consola:  npm run sync
require('dotenv').config();
const { syncAll } = require('../services/syncService');
const { pool } = require('../config/db');

syncAll()
  .then((r) => {
    console.table(r.results);
    if (r.errors?.length) console.error(r.errors);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
