// Tarea programada (cron) que mantiene la base de datos actualizada automáticamente
const cron = require('node-cron');
const { syncAll } = require('../services/syncService');

function startScheduler() {
  const expression = process.env.SYNC_CRON || '*/15 * * * 1-5';
  if (!cron.validate(expression)) {
    console.error(`[CRON] Expresión inválida "${expression}". Automatización desactivada.`);
    return;
  }
  // Horario de Nueva York, donde opera el NASDAQ
  cron.schedule(expression, () => {
    syncAll().catch((err) => console.error('[CRON] Error en sincronización:', err.message));
  }, { timezone: 'America/New_York' });
  console.log(`[CRON] Automatización activa: "${expression}" (hora de Nueva York)`);

  if (process.env.SYNC_ON_START !== 'false') {
    syncAll().catch((err) => console.error('[CRON] Error en sincronización inicial:', err.message));
  }
}

module.exports = { startScheduler };
