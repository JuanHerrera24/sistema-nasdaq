// Pruebas de la lógica de negocio:  npm test
const test = require('node:test');
const assert = require('node:assert');
const { analyze, sma, smaSeries, rsi, volatility, simulateInvestment } = require('../../src/services/analysisService');

const series = (vals) => vals.map((close, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, close }));

test('SMA calcula el promedio de los últimos N valores', () => {
  assert.strictEqual(sma([1, 2, 3, 4, 5], 5), 3);
  assert.strictEqual(sma([1, 2], 5), null);
});

test('RSI es 100 cuando solo hay subidas', () => {
  assert.strictEqual(rsi(Array.from({ length: 30 }, (_, i) => 100 + i)), 100);
});

test('Tendencia alcista sostenida no recomienda VENDER', () => {
  const up = series(Array.from({ length: 120 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2));
  assert.notStrictEqual(analyze(up).recommendation, 'VENDER');
});

test('Tendencia bajista sostenida recomienda VENDER', () => {
  const down = series(Array.from({ length: 120 }, (_, i) => 200 - i * 0.8 + Math.sin(i) * 2));
  assert.strictEqual(analyze(down).recommendation, 'VENDER');
});

test('Simulación de inversión respeta los decimales (centavos)', () => {
  const r = simulateInvestment('1000.55', 100, 110);
  assert.strictEqual(r.invested, 1000.55);
  assert.strictEqual(r.shares, 10.0055);
  assert.strictEqual(r.currentValue, 1100.61);
  assert.strictEqual(r.profit, 100.06);
});

test('Simulación rechaza montos inválidos', () => {
  assert.throws(() => simulateInvestment('-5', 100, 110));
  assert.throws(() => simulateInvestment('abc', 100, 110));
});

test('smaSeries devuelve null hasta completar el periodo y luego la media móvil', () => {
  assert.deepStrictEqual(smaSeries([2, 4, 6, 8], 2), [null, 3, 5, 7]);
});

test('RSI es 0 cuando solo hay bajadas y null sin datos suficientes', () => {
  assert.strictEqual(rsi(Array.from({ length: 30 }, (_, i) => 200 - i)), 0);
  assert.strictEqual(rsi([1, 2, 3]), null);
});

test('Volatilidad es 0 con retornos constantes y null sin datos suficientes', () => {
  const constant = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
  assert.ok(volatility(constant) < 1e-6);
  assert.strictEqual(volatility([1, 2, 3]), null);
});

test('Histórico insuficiente (< 20 días) recomienda MANTENER con puntaje 0', () => {
  const r = analyze(series([10, 11, 12]));
  assert.strictEqual(r.recommendation, 'MANTENER');
  assert.strictEqual(r.score, 0);
});

test('El puntaje siempre queda entre -100 y 100 e incluye indicadores y razones', () => {
  const up = analyze(series(Array.from({ length: 120 }, (_, i) => 100 * 1.03 ** i)));
  assert.ok(up.score <= 100 && up.score >= -100);
  for (const k of ['price', 'sma20', 'sma50', 'rsi14', 'volatility', 'momentum1m']) {
    assert.ok(k in up.indicators, `falta el indicador ${k}`);
  }
  assert.ok(up.reasons.length >= 3);
});

test('Simulación con pérdida devuelve ganancia negativa', () => {
  const r = simulateInvestment('500', 100, 80);
  assert.strictEqual(r.currentValue, 400);
  assert.strictEqual(r.profit, -100);
  assert.strictEqual(r.profitPercent, -20);
});
