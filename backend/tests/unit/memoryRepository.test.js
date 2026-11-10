// Pruebas unitarias del repositorio en memoria (mismo contrato que el de MySQL)
const test = require('node:test');
const assert = require('node:assert');
const repo = require('../../src/repositories/memoryStockRepository');

test.beforeEach(() => repo.reset());

test('Inicia con las 8 acciones del NASDAQ-100 de schema.sql', async () => {
  const stocks = await repo.getActiveStocks();
  assert.deepStrictEqual(stocks.map((s) => s.symbol), ['AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA']);
});

test('upsertStock crea una acción nueva y actualiza una existente sin duplicarla', async () => {
  const amd = await repo.upsertStock({ symbol: 'AMD', name: 'Advanced Micro Devices', exchange: 'NasdaqGS', currency: 'USD' });
  assert.strictEqual(amd.symbol, 'AMD');
  const again = await repo.upsertStock({ symbol: 'AMD', name: 'AMD Inc.' });
  assert.strictEqual(again.id, amd.id);
  assert.strictEqual(again.name, 'AMD Inc.');
  assert.strictEqual((await repo.getActiveStocks()).length, 9);
});

test('upsertStock respeta los límites de caracteres de la BD', async () => {
  const s = await repo.upsertStock({ symbol: 'LONG', name: 'x'.repeat(300), exchange: 'y'.repeat(50), currency: 'USDX' });
  assert.strictEqual(s.name.length, 120);
  assert.strictEqual(s.exchange.length, 30);
  assert.strictEqual(s.currency, 'USD');
});

test('saveHistory no duplica días y getHistory los devuelve ordenados', async () => {
  const { id } = await repo.getStockBySymbol('AAPL');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await repo.saveHistory(id, [{ date: today, close: 10 }, { date: yesterday, close: 9 }]);
  await repo.saveHistory(id, [{ date: today, close: 11 }]);
  const h = await repo.getHistory(id, 30);
  assert.deepStrictEqual(h.map((d) => [d.date, d.close]), [[yesterday, 9], [today, 11]]);
});

test('deactivateStock deja de seguir la acción y devuelve false si no existe', async () => {
  assert.strictEqual(await repo.deactivateStock('TSLA'), true);
  assert.ok(!(await repo.getActiveStocks()).some((s) => s.symbol === 'TSLA'));
  assert.strictEqual(await repo.deactivateStock('NOEXISTE'), false);
});

test('getDashboard combina última cotización y última recomendación', async () => {
  const { id } = await repo.getStockBySymbol('NVDA');
  await repo.saveQuote(id, { price: 120.5, change: 1.5, changePercent: 1.26 });
  const analysis = (recommendation, score) => ({ recommendation, score, indicators: { price: 120.5, rsi14: 55 }, reasons: ['r'] });
  await repo.saveRecommendation(id, analysis('MANTENER', 0));
  await repo.saveRecommendation(id, analysis('COMPRAR', 40));
  const nvda = (await repo.getDashboard()).find((s) => s.symbol === 'NVDA');
  assert.strictEqual(nvda.price, 120.5);
  assert.strictEqual(nvda.recommendation, 'COMPRAR');
  const hist = await repo.getRecommendationHistory(id, 10);
  assert.deepStrictEqual(hist.map((r) => r.recommendation), ['COMPRAR', 'MANTENER']);
});

test('La bitácora de sincronización registra inicio y fin', async () => {
  assert.strictEqual(await repo.getLastSync(), null);
  const logId = await repo.startSyncLog();
  await repo.finishSyncLog(logId, 7, 1, 'TSLA: error');
  const last = await repo.getLastSync();
  assert.strictEqual(last.symbols_ok, 7);
  assert.strictEqual(last.symbols_fail, 1);
  assert.ok(last.finished_at instanceof Date);
});
