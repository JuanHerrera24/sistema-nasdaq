// Servicio que consume valores REALES del mercado NASDAQ.
// Fuente principal: API pública de Yahoo Finance (sin API key).
// Respaldo: Stooq (CSV diario) si Yahoo no responde.

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const STOOQ_URL = 'https://stooq.com/q/d/l/?i=d&s=';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (NASDAQ-System academic project)' };

const SYMBOL_REGEX = /^[A-Z0-9.\-]{1,10}$/;

function normalizeSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!SYMBOL_REGEX.test(s)) {
    const err = new Error('Símbolo inválido. Use de 1 a 10 caracteres: letras, números, "." o "-"');
    err.status = 400;
    throw err;
  }
  return s;
}

async function fetchWithTimeout(url, ms = 10000) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'Símbolo no encontrado en el mercado' : `Respuesta HTTP ${res.status} de ${new URL(url).host}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return res;
}

// Redondea a 4 decimales (igual que DECIMAL(14,4) en MySQL)
const round4 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10000) / 10000);

async function fromYahoo(symbol, range) {
  const res = await fetchWithTimeout(`${YAHOO_URL}${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const err = new Error(`Símbolo "${symbol}" no encontrado`);
    err.status = 404;
    throw err;
  }

  const meta = result.meta;
  const q = result.indicators?.quote?.[0] || {};
  const history = (result.timestamp || [])
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: round4(q.open?.[i]),
      high: round4(q.high?.[i]),
      low: round4(q.low?.[i]),
      close: round4(q.close?.[i]),
      volume: q.volume?.[i] ?? null,
    }))
    .filter((d) => d.close != null);

  const price = round4(meta.regularMarketPrice);
  // chartPreviousClose es el cierre antes del rango; el anterior real es el penúltimo día
  const prev = history.length > 1 && history.at(-1).date === new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    ? history.at(-2).close
    : history.at(-1)?.close ?? round4(meta.chartPreviousClose);

  return {
    source: 'Yahoo Finance',
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    exchange: meta.fullExchangeName || meta.exchangeName,
    currency: meta.currency || 'USD',
    quote: {
      price,
      previousClose: prev,
      change: prev ? round4(price - prev) : null,
      changePercent: prev ? round4(((price - prev) / prev) * 100) : null,
      dayHigh: round4(meta.regularMarketDayHigh),
      dayLow: round4(meta.regularMarketDayLow),
      volume: meta.regularMarketVolume ?? null,
      marketTime: new Date(meta.regularMarketTime * 1000).toISOString(),
    },
    history,
  };
}

async function fromStooq(symbol) {
  const res = await fetchWithTimeout(`${STOOQ_URL}${encodeURIComponent(symbol.toLowerCase())}.us`);
  const csv = (await res.text()).trim().split('\n');
  if (csv.length < 3) {
    const err = new Error(`Símbolo "${symbol}" no encontrado`);
    err.status = 404;
    throw err;
  }
  const history = csv.slice(1).slice(-260).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return { date, open: round4(+open), high: round4(+high), low: round4(+low), close: round4(+close), volume: volume ? +volume : null };
  });
  const last = history.at(-1);
  const prev = history.at(-2)?.close ?? null;
  return {
    source: 'Stooq',
    symbol,
    name: symbol,
    exchange: 'NASDAQ',
    currency: 'USD',
    quote: {
      price: last.close,
      previousClose: prev,
      change: prev ? round4(last.close - prev) : null,
      changePercent: prev ? round4(((last.close - prev) / prev) * 100) : null,
      dayHigh: last.high,
      dayLow: last.low,
      volume: last.volume,
      marketTime: new Date(`${last.date}T21:00:00Z`).toISOString(),
    },
    history,
  };
}

/**
 * Obtiene cotización actual + histórico diario de un símbolo del NASDAQ.
 * @param {string} symbol  Ej: "AAPL"
 * @param {string} range   1mo | 3mo | 6mo | 1y | 2y
 */
async function getMarketData(symbol, range = '1y') {
  const s = normalizeSymbol(symbol);
  try {
    return await fromYahoo(s, range);
  } catch (err) {
    if (err.status === 404) throw err;
    console.warn(`[NASDAQ] Yahoo falló para ${s} (${err.message}). Usando Stooq...`);
    return fromStooq(s);
  }
}

module.exports = { getMarketData, normalizeSymbol };
