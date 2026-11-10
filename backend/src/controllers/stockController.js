// Controladores: reciben la petición HTTP, llaman a la lógica de negocio y responden JSON
const nasdaq = require('../services/nasdaqService');
const { analyze, smaSeries, simulateInvestment } = require('../services/analysisService');
const { syncAll, syncSymbol } = require('../services/syncService');
const repo = require('../repositories/stockRepository');

const RANGES = { '1mo': 31, '3mo': 92, '6mo': 183, '1y': 366, '2y': 731 };

// GET /api/stocks  -> panel con todas las acciones seguidas
async function dashboard(req, res) {
  // En memoria (Vercel) no hay cron permanente: la primera visita descarga los datos
  if (repo.mode === 'memory' && !(await repo.getLastSync())) await syncAll();
  const [stocks, lastSync] = await Promise.all([repo.getDashboard(), repo.getLastSync()]);
  res.json({ stocks, lastSync });
}

// GET /api/stocks/:symbol?range=6mo  -> detalle, histórico, indicadores y recomendación
async function detail(req, res) {
  const symbol = nasdaq.normalizeSymbol(req.params.symbol);
  const range = RANGES[req.query.range] ? req.query.range : '6mo';

  // Se cargan 2 años para que las medias móviles estén completas desde el inicio del gráfico
  let stock = await repo.getStockBySymbol(symbol);
  let fullHistory = stock?.active ? await repo.getHistory(stock.id, 800) : [];
  if (!fullHistory.length) {
    // Si no se sigue aún (o no tiene datos), se descarga en vivo del NASDAQ y se agrega al seguimiento
    await syncSymbol(symbol);
    stock = await repo.getStockBySymbol(symbol);
    fullHistory = await repo.getHistory(stock.id, 800);
  }
  const analysis = analyze(fullHistory);
  const closes = fullHistory.map((d) => d.close);
  const s20 = smaSeries(closes, 20);
  const s50 = smaSeries(closes, 50);

  const from = new Date(Date.now() - RANGES[range] * 864e5).toISOString().slice(0, 10);
  const chart = fullHistory
    .map((d, i) => ({ ...d, sma20: s20[i], sma50: s50[i] }))
    .filter((d) => d.date >= from);

  const dash = (await repo.getDashboard()).find((s) => s.symbol === symbol);
  res.json({
    symbol,
    name: stock.name,
    exchange: stock.exchange,
    quote: dash,
    analysis,
    chart,
    recommendationHistory: await repo.getRecommendationHistory(stock.id, 20),
  });
}

// GET /api/live/:symbol -> cotización en vivo directa del NASDAQ (sin guardar)
async function live(req, res) {
  const data = await nasdaq.getMarketData(req.params.symbol, '3mo');
  res.json({ source: data.source, symbol: data.symbol, name: data.name, exchange: data.exchange, quote: data.quote });
}

// POST /api/stocks { symbol } -> agregar acción al seguimiento automático
async function add(req, res) {
  const symbol = nasdaq.normalizeSymbol(req.body?.symbol);
  const result = await syncSymbol(symbol);
  res.status(201).json(result);
}

// DELETE /api/stocks/:symbol -> dejar de seguir
async function remove(req, res) {
  const symbol = nasdaq.normalizeSymbol(req.params.symbol);
  const ok = await repo.deactivateStock(symbol);
  if (!ok) return res.status(404).json({ error: 'La acción no existe' });
  res.status(204).end();
}

// POST /api/sync -> fuerza la sincronización de todas las acciones
async function sync(req, res) {
  res.json(await syncAll());
}

// POST /api/simulate { symbol, amount, date } -> simulación de inversión con decimales
async function simulate(req, res) {
  const symbol = nasdaq.normalizeSymbol(req.body?.symbol);
  const stock = await repo.getStockBySymbol(symbol);
  if (!stock) return res.status(404).json({ error: 'Primero agregue la acción al seguimiento' });

  let history = await repo.getHistory(stock.id, 800);
  if (!history.length && stock.active) {
    await syncSymbol(symbol);
    history = await repo.getHistory(stock.id, 800);
  }
  if (!history.length) return res.status(404).json({ error: 'Sin histórico para esta acción' });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || '') ? req.body.date : history[0].date;
  const buy = history.find((d) => d.date >= date) || history[0];
  const current = history.at(-1);
  res.json({ symbol, buyDate: buy.date, currentDate: current.date, ...simulateInvestment(req.body?.amount, buy.close, current.close) });
}

module.exports = { dashboard, detail, live, add, remove, sync, simulate };
