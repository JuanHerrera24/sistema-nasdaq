// Automatización: descarga datos reales del NASDAQ, los guarda en MySQL
// y genera una nueva recomendación por cada acción activa.
const nasdaq = require('./nasdaqService');
const { analyze } = require('./analysisService');
const repo = require('../repositories/stockRepository');

let running = false;

async function syncSymbol(symbol, range = process.env.HISTORY_RANGE || '2y') {
  const data = await nasdaq.getMarketData(symbol, range);
  const stock = await repo.upsertStock(data);
  await repo.saveHistory(stock.id, data.history);
  await repo.saveQuote(stock.id, data.quote);
  const analysis = analyze(data.history);
  await repo.saveRecommendation(stock.id, analysis);
  return { symbol: stock.symbol, price: data.quote.price, recommendation: analysis.recommendation };
}

async function syncAll() {
  if (running) return { skipped: true, message: 'Ya hay una sincronización en curso' };
  running = true;
  const logId = await repo.startSyncLog();
  const results = [];
  const errors = [];
  try {
    const stocks = await repo.getActiveStocks();
    for (const s of stocks) {
      try {
        results.push(await syncSymbol(s.symbol));
      } catch (err) {
        errors.push(`${s.symbol}: ${err.message}`);
      }
      // Pausa corta entre peticiones para no saturar la fuente de datos
      await new Promise((r) => setTimeout(r, Number(process.env.SYNC_PAUSE_MS ?? 400)));
    }
    const msg = errors.length ? errors.join('; ') : 'OK';
    await repo.finishSyncLog(logId, results.length, errors.length, msg);
    console.log(`[SYNC] ${new Date().toISOString()} -> ${results.length} OK, ${errors.length} con error`);
    return { ok: results.length, failed: errors.length, results, errors };
  } finally {
    running = false;
  }
}

module.exports = { syncAll, syncSymbol };
