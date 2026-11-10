// Pruebas automatizadas de la API REST de punta a punta:
// se levanta el servidor Express real y se le hacen peticiones HTTP.
// La fuente de datos externa se simula y la BD se reemplaza por memoria.
process.env.DATA_STORE = 'memory';
process.env.SYNC_PAUSE_MS = '0';

const test = require('node:test');
const assert = require('node:assert');
const { installFakeFetch } = require('../helpers/fakeMarket');
const app = require('../../src/app');
const repo = require('../../src/repositories/stockRepository');
const { signToken } = require('../../src/services/authService');

// Sesión válida para las rutas protegidas
const token = signToken({ id: 1, email: 'qa@nasdaq.com', fullName: 'QA', role: 'analista' });

let base;
let server;
let fake;

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test.beforeEach((t) => {
  repo.reset();
  // Solo se simulan las URLs externas; las peticiones a nuestro servidor usan el fetch real
  const realFetch = global.fetch;
  fake = installFakeFetch({ unknown: new Set(['ZZZZ']), trends: { TSLA: -0.8 } });
  const externalFetch = global.fetch;
  global.fetch = (url, opts) => (String(url).startsWith(base) ? realFetch(url, opts) : externalFetch(url, opts));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
});

test.afterEach(() => fake.restore());

const api = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
});

test('GET /api/health responde ok', async () => {
  const res = await api('/api/health');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.dataStore, 'memory');
});

test('GET /api/stocks sincroniza automáticamente y devuelve el panel con recomendaciones', async () => {
  const res = await api('/api/stocks');
  assert.strictEqual(res.status, 200);
  const { stocks, lastSync } = await res.json();
  assert.strictEqual(stocks.length, 8);
  assert.ok(lastSync.finished_at);
  for (const s of stocks) {
    assert.ok(s.price > 0, `${s.symbol} sin precio`);
    assert.ok(['COMPRAR', 'MANTENER', 'VENDER'].includes(s.recommendation));
  }
  assert.strictEqual(stocks.find((s) => s.symbol === 'TSLA').recommendation, 'VENDER');
});

test('GET /api/stocks/:symbol devuelve gráfico, indicadores y recomendación', async () => {
  const res = await api('/api/stocks/aapl?range=3mo');
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.symbol, 'AAPL');
  assert.ok(d.chart.length > 0 && d.chart.length <= 93);
  assert.ok('sma20' in d.chart.at(-1) && 'sma50' in d.chart.at(-1));
  assert.ok(d.analysis.indicators.rsi14 != null);
  assert.strictEqual(d.recommendationHistory.length, 1);
});

test('POST /api/stocks agrega una acción nueva al seguimiento', async () => {
  const res = await api('/api/stocks', { method: 'POST', body: JSON.stringify({ symbol: 'amd' }) });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).symbol, 'AMD');
  assert.ok((await repo.getActiveStocks()).some((s) => s.symbol === 'AMD'));
});

test('POST /api/stocks con un símbolo inexistente responde 404', async () => {
  const res = await api('/api/stocks', { method: 'POST', body: JSON.stringify({ symbol: 'ZZZZ' }) });
  assert.strictEqual(res.status, 404);
});

test('DELETE /api/stocks/:symbol deja de seguir la acción (204) y 404 si no existe', async () => {
  assert.strictEqual((await api('/api/stocks/META', { method: 'DELETE' })).status, 204);
  assert.ok(!(await repo.getActiveStocks()).some((s) => s.symbol === 'META'));
  assert.strictEqual((await api('/api/stocks/NOPE', { method: 'DELETE' })).status, 404);
});

test('GET /api/live/:symbol devuelve la cotización en vivo sin guardarla', async () => {
  const res = await api('/api/live/GOOGL');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.source, 'Yahoo Finance');
  assert.ok(body.quote.price > 0);
  assert.strictEqual(await repo.getLastSync(), null);
});

test('POST /api/simulate calcula la inversión con decimales', async () => {
  await api('/api/stocks/MSFT');
  const res = await api('/api/simulate', { method: 'POST', body: JSON.stringify({ symbol: 'MSFT', amount: '1500.75' }) });
  assert.strictEqual(res.status, 200);
  const r = await res.json();
  assert.strictEqual(r.invested, 1500.75);
  assert.ok(r.shares > 0);
  assert.ok(typeof r.profitPercent === 'number');
});

test('POST /api/simulate rechaza montos inválidos (400) y acciones no seguidas (404)', async () => {
  await api('/api/stocks/MSFT');
  const bad = await api('/api/simulate', { method: 'POST', body: JSON.stringify({ symbol: 'MSFT', amount: '-10' }) });
  assert.strictEqual(bad.status, 400);
  const missing = await api('/api/simulate', { method: 'POST', body: JSON.stringify({ symbol: 'INTC', amount: '10' }) });
  assert.strictEqual(missing.status, 404);
});

test('Seguridad: rechaza intentos de inyección en el símbolo', async () => {
  const res = await api(`/api/stocks/${encodeURIComponent("1' OR '1'='1")}`);
  assert.strictEqual(res.status, 400);
});

test('Seguridad: rechaza cuerpos JSON de más de 10 KB', async () => {
  const res = await api('/api/stocks', { method: 'POST', body: JSON.stringify({ symbol: 'A'.repeat(20_000) }) });
  assert.strictEqual(res.status, 413);
});

test('Seguridad: envía cabeceras de helmet y CSP', async () => {
  const res = await api('/api/health');
  assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('x-powered-by'), null);
});

test('Seguridad: limita la sincronización manual a 3 por minuto', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await api('/api/sync', { method: 'POST' })).status);
  assert.deepStrictEqual(statuses, [200, 200, 200, 429]);
});

test('Sirve el frontend (index.html) en la raíz', async () => {
  const res = await api('/');
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /<html/i);
});
