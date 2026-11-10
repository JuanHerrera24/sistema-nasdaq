// Pruebas de la automatización: descargar -> guardar -> recomendar
process.env.DATA_STORE = 'memory';
process.env.SYNC_PAUSE_MS = '0';

const test = require('node:test');
const assert = require('node:assert');
const repo = require('../../src/repositories/stockRepository');
const { syncAll, syncSymbol } = require('../../src/services/syncService');
const { installFakeFetch } = require('../helpers/fakeMarket');

test.beforeEach(() => repo.reset());

test('Usa el repositorio en memoria cuando DATA_STORE=memory', () => {
  assert.strictEqual(repo.mode, 'memory');
});

test('syncSymbol guarda histórico, cotización y recomendación', async (t) => {
  const fake = installFakeFetch({ trends: { AMD: -0.8 } });
  t.after(fake.restore);
  const r = await syncSymbol('AMD', '6mo');
  assert.strictEqual(r.symbol, 'AMD');
  assert.strictEqual(r.recommendation, 'VENDER');
  const stock = await repo.getStockBySymbol('AMD');
  assert.strictEqual((await repo.getHistory(stock.id, 800)).length, 120);
  const dash = (await repo.getDashboard()).find((s) => s.symbol === 'AMD');
  assert.strictEqual(dash.price, r.price);
  assert.strictEqual(dash.recommendation, 'VENDER');
});

test('syncAll procesa todas las acciones activas y registra los errores sin detenerse', async (t) => {
  const fake = installFakeFetch({ unknown: new Set(['NFLX']) });
  t.after(fake.restore);
  t.mock.method(console, 'log', () => {});
  const r = await syncAll();
  assert.strictEqual(r.ok, 7);
  assert.strictEqual(r.failed, 1);
  assert.match(r.errors[0], /^NFLX:/);
  const log = await repo.getLastSync();
  assert.strictEqual(log.symbols_ok, 7);
  assert.strictEqual(log.symbols_fail, 1);
});

test('syncAll no permite dos sincronizaciones simultáneas', async (t) => {
  const fake = installFakeFetch();
  t.after(fake.restore);
  t.mock.method(console, 'log', () => {});
  const [a, b] = await Promise.all([syncAll(), syncAll()]);
  assert.ok(a.skipped || b.skipped);
  assert.ok(a.ok === 8 || b.ok === 8);
});
