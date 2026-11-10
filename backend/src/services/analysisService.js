// Lógica de negocio: indicadores técnicos y recomendación de inversión.
// IMPORTANTE: es un modelo académico basado en análisis técnico, no asesoría financiera.

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Serie completa de SMA (para graficar), null donde no hay datos suficientes
function smaSeries(values, period) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i - period];
    return i >= period - 1 ? Math.round((sum / period) * 10000) / 10000 : null;
  });
}

// RSI de Wilder (14 periodos)
function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Volatilidad anualizada (%) a partir de retornos diarios de los últimos `period` días
function volatility(values, period = 30) {
  if (values.length < period + 1) return null;
  const slice = values.slice(-(period + 1));
  const returns = slice.slice(1).map((v, i) => Math.log(v / slice[i]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function pctChange(values, days) {
  if (values.length <= days) return null;
  const past = values[values.length - 1 - days];
  return ((values.at(-1) - past) / past) * 100;
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const r4 = (n) => (n == null ? null : Math.round(n * 10000) / 10000);

/**
 * Genera la recomendación combinando 4 señales con un puntaje de -100 a 100:
 *  - Tendencia: precio vs SMA50 y cruce SMA20/SMA50   (±40)
 *  - RSI: sobrecompra / sobreventa                     (±30)
 *  - Momentum de 1 mes                                  (±20)
 *  - Penalización por volatilidad alta                 (-10)
 */
function analyze(history) {
  const closes = history.map((d) => d.close).filter((v) => v != null);
  if (closes.length < 20) {
    return {
      recommendation: 'MANTENER',
      score: 0,
      indicators: {},
      reasons: ['Histórico insuficiente para emitir una recomendación confiable'],
    };
  }

  const price = closes.at(-1);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const vol = volatility(closes, 30);
  const mom1m = pctChange(closes, 21);
  const ret1y = pctChange(closes, Math.min(closes.length - 1, 252));

  let score = 0;
  const reasons = [];

  // 1. Tendencia
  if (s50 != null) {
    if (price > s50) { score += 20; reasons.push(`Precio por encima de la media de 50 días (${r2(s50)}): tendencia alcista`); }
    else { score -= 20; reasons.push(`Precio por debajo de la media de 50 días (${r2(s50)}): tendencia bajista`); }
    if (s20 > s50) { score += 20; reasons.push('Media de 20 días sobre la de 50 (cruce alcista)'); }
    else { score -= 20; reasons.push('Media de 20 días bajo la de 50 (cruce bajista)'); }
  } else if (s20 != null) {
    if (price > s20) { score += 15; reasons.push('Precio por encima de la media de 20 días'); }
    else { score -= 15; reasons.push('Precio por debajo de la media de 20 días'); }
  }

  // 2. RSI
  if (rsi14 != null) {
    if (rsi14 < 30) { score += 30; reasons.push(`RSI ${r2(rsi14)}: acción sobrevendida, posible rebote`); }
    else if (rsi14 > 70) { score -= 30; reasons.push(`RSI ${r2(rsi14)}: acción sobrecomprada, riesgo de corrección`); }
    else if (rsi14 >= 50) { score += 10; reasons.push(`RSI ${r2(rsi14)}: impulso comprador moderado`); }
    else { score -= 10; reasons.push(`RSI ${r2(rsi14)}: impulso vendedor moderado`); }
  }

  // 3. Momentum
  if (mom1m != null) {
    const pts = Math.max(-20, Math.min(20, mom1m * 2));
    score += pts;
    reasons.push(`Variación del último mes: ${r2(mom1m)}%`);
  }

  // 4. Riesgo
  if (vol != null && vol > 50) {
    score -= 10;
    reasons.push(`Volatilidad alta (${r2(vol)}% anual): mayor riesgo`);
  }

  score = Math.max(-100, Math.min(100, score));
  const recommendation = score >= 25 ? 'COMPRAR' : score <= -25 ? 'VENDER' : 'MANTENER';

  return {
    recommendation,
    score: r2(score),
    indicators: {
      price: r4(price),
      sma20: r4(s20),
      sma50: r4(s50),
      rsi14: r2(rsi14),
      volatility: r2(vol),
      momentum1m: r2(mom1m),
      return1y: r2(ret1y),
    },
    reasons,
  };
}

/**
 * Simula una inversión con valores decimales exactos (se trabaja en centavos
 * para evitar errores de punto flotante).
 */
function simulateInvestment(amount, buyPrice, currentPrice) {
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    const err = new Error('El monto debe ser un número decimal mayor que 0 (ej: 1500.75)');
    err.status = 400;
    throw err;
  }
  const shares = Math.floor((amountCents / 100 / buyPrice) * 1e6) / 1e6; // 6 decimales (acciones fraccionadas)
  const valueCents = Math.round(shares * currentPrice * 100);
  const profitCents = valueCents - amountCents;
  return {
    invested: amountCents / 100,
    buyPrice: r4(buyPrice),
    currentPrice: r4(currentPrice),
    shares,
    currentValue: valueCents / 100,
    profit: profitCents / 100,
    profitPercent: r2((profitCents / amountCents) * 100),
  };
}

module.exports = { analyze, smaSeries, rsi, sma, volatility, simulateInvestment };
