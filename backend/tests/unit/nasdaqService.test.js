// Pruebas unitarias del servicio que consume el NASDAQ (con la API externa simulada)
const test = require('node:test');
const assert = require('node:assert');
const { getMarketData, normalizeSymbol } = require('../../src/services/nasdaqService');
const { installFakeFetch } = require('../helpers/fakeMarket');

test('normalizeSymbol convierte a mayúsculas y quita espacios', () => {
  assert.strictEqual(normalizeSymbol('  aapl '), 'AAPL');
  assert.strictEqual(normalizeSymbol('brk.b'), 'BRK.B');
});

test('normalizeSymbol rechaza símbolos inválidos con error 400', () => {
  for (const bad of ['', 'DEMASIADOLARGO', "AAPL'; DROP TABLE stocks;--", '<script>', null]) {
    assert.throws(() => normalizeSymbol(bad), (err) => err.status === 400, `debería rechazar ${bad}`);
  }
});

test('getMarketData obtiene cotización e histórico desde Yahoo Finance', async (t) => {
  const fake = installFakeFetch();
  t.after(fake.restore);
  const data = await getMarketData('msft', '6mo');
  assert.strictEqual(data.source, 'Yahoo Finance');
  assert.strictEqual(data.symbol, 'MSFT');
  assert.strictEqual(data.history.length, 120);
  assert.ok(data.quote.price > 0);
  assert.strictEqual(data.quote.previousClose, data.history.at(-2).close);
  assert.match(fake.calls[0], /range=6mo/);
});

test('getMarketData usa Stooq como respaldo si Yahoo no responde', async (t) => {
  const fake = installFakeFetch({ yahooDown: true });
  t.after(fake.restore);
  t.mock.method(console, 'warn', () => {});
  const data = await getMarketData('AAPL');
  assert.strictEqual(data.source, 'Stooq');
  assert.strictEqual(data.history.length, 60);
  assert.ok(fake.calls.some((u) => u.includes('stooq.com')));
});

test('getMarketData propaga 404 cuando el símbolo no existe (sin usar respaldo)', async (t) => {
  const fake = installFakeFetch({ unknown: new Set(['ZZZZ']) });
  t.after(fake.restore);
  await assert.rejects(getMarketData('ZZZZ'), (err) => err.status === 404);
  assert.ok(!fake.calls.some((u) => u.includes('stooq.com')));
});
