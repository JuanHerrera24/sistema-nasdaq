// Simula las APIs externas (Yahoo Finance y Stooq) para que las pruebas
// no dependan de internet ni del horario del mercado.

const DAY = 864e5;

// Precios sintéticos: tendencia según `trend` (+ sube, - baja) con una oscilación suave
function prices(days, trend = 0.5, start = 100) {
  return Array.from({ length: days }, (_, i) => Math.round((start + i * trend + Math.sin(i) * 2) * 10000) / 10000);
}

function yahooChart(symbol, { days = 120, trend = 0.5 } = {}) {
  const closes = prices(days, trend);
  const now = Date.now();
  const timestamp = closes.map((_, i) => Math.floor((now - (days - 1 - i) * DAY) / 1000));
  return {
    chart: {
      result: [{
        meta: {
          symbol,
          longName: `${symbol} Test Corp.`,
          fullExchangeName: 'NasdaqGS',
          currency: 'USD',
          regularMarketPrice: closes.at(-1),
          regularMarketTime: timestamp.at(-1),
          regularMarketDayHigh: closes.at(-1) + 1,
          regularMarketDayLow: closes.at(-1) - 1,
          regularMarketVolume: 1_000_000,
          chartPreviousClose: closes[0],
        },
        timestamp,
        indicators: {
          quote: [{
            open: closes.map((c) => c - 0.5),
            high: closes.map((c) => c + 1),
            low: closes.map((c) => c - 1),
            close: closes,
            volume: closes.map(() => 1_000_000),
          }],
        },
      }],
    },
  };
}

function stooqCsv({ days = 60, trend = 0.5 } = {}) {
  const closes = prices(days, trend);
  const now = Date.now();
  const rows = closes.map((c, i) => {
    const date = new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10);
    return `${date},${c - 0.5},${c + 1},${c - 1},${c},500000`;
  });
  return ['Date,Open,High,Low,Close,Volume', ...rows].join('\n');
}

/**
 * Reemplaza global.fetch.
 * @param {object} opts
 * @param {boolean} opts.yahooDown   Yahoo responde 503 (para probar el respaldo Stooq)
 * @param {Set<string>} opts.unknown Símbolos que no existen (404)
 * @param {Object<string,number>} opts.trends  Tendencia por símbolo (ej. { TSLA: -0.8 })
 */
function installFakeFetch({ yahooDown = false, unknown = new Set(), trends = {} } = {}) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.href);
    if (url.host.includes('yahoo')) {
      const symbol = decodeURIComponent(url.pathname.split('/').pop());
      if (yahooDown) return new Response('Service Unavailable', { status: 503 });
      if (unknown.has(symbol)) return new Response('{}', { status: 404 });
      return Response.json(yahooChart(symbol, { trend: trends[symbol] ?? 0.5 }));
    }
    if (url.host.includes('stooq')) {
      return new Response(stooqCsv(), { status: 200 });
    }
    throw new Error(`URL no simulada: ${url.href}`);
  };
  return { calls, restore: () => { global.fetch = original; } };
}

module.exports = { installFakeFetch, yahooChart, prices };
