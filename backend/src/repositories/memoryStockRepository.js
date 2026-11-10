// Acceso a datos en MEMORIA. Mismas funciones que mysqlStockRepository.js.
// Se usa cuando no hay MySQL disponible (despliegue en Vercel, pruebas automatizadas).
// Los datos viven mientras el proceso esté activo.

const INITIAL_STOCKS = [
  ['AAPL', 'Apple Inc.'],
  ['MSFT', 'Microsoft Corporation'],
  ['NVDA', 'NVIDIA Corporation'],
  ['AMZN', 'Amazon.com Inc.'],
  ['GOOGL', 'Alphabet Inc.'],
  ['META', 'Meta Platforms Inc.'],
  ['TSLA', 'Tesla Inc.'],
  ['NFLX', 'Netflix Inc.'],
];

let db;

// Deja la "base de datos" como recién creada con schema.sql (útil en pruebas)
function reset() {
  db = { stocks: [], history: new Map(), quotes: new Map(), recommendations: [], syncLog: [], users: [], seq: { stock: 0, reco: 0, log: 0, user: 0 } };
  for (const [symbol, name] of INITIAL_STOCKS) {
    db.stocks.push({ id: ++db.seq.stock, symbol, name, exchange: null, currency: 'USD', active: 1, created_at: new Date() });
  }
}
reset();

const copy = (o) => (o ? { ...o } : null);

async function getActiveStocks() {
  return db.stocks.filter((s) => s.active).sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map(({ id, symbol, name }) => ({ id, symbol, name }));
}

async function getStockBySymbol(symbol) {
  return copy(db.stocks.find((s) => s.symbol === symbol));
}

async function upsertStock({ symbol, name, exchange, currency }) {
  let s = db.stocks.find((x) => x.symbol === symbol);
  if (!s) {
    s = { id: ++db.seq.stock, symbol, created_at: new Date() };
    db.stocks.push(s);
  }
  Object.assign(s, {
    name: (name || symbol).slice(0, 120),
    exchange: (exchange || '').slice(0, 30),
    currency: (currency || 'USD').slice(0, 3),
    active: 1,
  });
  return copy(s);
}

async function deactivateStock(symbol) {
  const s = db.stocks.find((x) => x.symbol === symbol);
  if (!s) return false;
  s.active = 0;
  return true;
}

async function saveQuote(stockId, q) {
  db.quotes.set(stockId, { ...q, fetchedAt: new Date() });
}

async function saveHistory(stockId, history) {
  const byDate = db.history.get(stockId) || new Map();
  for (const d of history) byDate.set(d.date, { ...d });
  db.history.set(stockId, byDate);
}

async function getHistory(stockId, days = 365) {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return [...(db.history.get(stockId)?.values() || [])]
    .filter((d) => d.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d }));
}

async function saveRecommendation(stockId, analysis) {
  const i = analysis.indicators;
  db.recommendations.push({
    id: ++db.seq.reco, stock_id: stockId, recommendation: analysis.recommendation, score: analysis.score,
    price: i.price, rsi14: i.rsi14, reasons: analysis.reasons.join(' | ').slice(0, 1000), created_at: new Date(),
  });
}

const lastReco = (stockId) => db.recommendations.filter((r) => r.stock_id === stockId).at(-1);

async function getDashboard() {
  return (await getActiveStocks()).map(({ id }) => {
    const s = db.stocks.find((x) => x.id === id);
    const q = db.quotes.get(id) || {};
    const r = lastReco(id) || {};
    return {
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      price: q.price ?? null,
      change: q.change ?? null,
      changePercent: q.changePercent ?? null,
      volume: q.volume ?? null,
      marketTime: q.marketTime ?? null,
      fetchedAt: q.fetchedAt ?? null,
      recommendation: r.recommendation ?? null,
      score: r.score ?? null,
      rsi14: r.rsi14 ?? null,
    };
  });
}

async function getRecommendationHistory(stockId, limit = 30) {
  return db.recommendations.filter((r) => r.stock_id === stockId).slice(-limit).reverse()
    .map(({ recommendation, score, price, rsi14, created_at }) => ({ recommendation, score, price, rsi14, created_at }));
}

async function startSyncLog() {
  const id = ++db.seq.log;
  db.syncLog.push({ id, started_at: new Date(), finished_at: null, symbols_ok: 0, symbols_fail: 0, message: null });
  return id;
}

async function finishSyncLog(id, ok, fail, message) {
  Object.assign(db.syncLog.find((l) => l.id === id), {
    finished_at: new Date(), symbols_ok: ok, symbols_fail: fail, message: (message || '').slice(0, 1000),
  });
}

async function getLastSync() {
  return copy(db.syncLog.at(-1));
}

// ---------------- Usuarios (login) ----------------
async function findUserByEmail(email) {
  return copy(db.users.find((u) => u.email === email));
}

async function createUser({ fullName, email, passwordHash, role = 'analista' }) {
  if (db.users.some((u) => u.email === email)) {
    throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
  }
  const user = { id: ++db.seq.user, fullName, email, passwordHash, role, lastLogin: null };
  db.users.push(user);
  return { id: user.id, fullName, email, role };
}

async function touchLogin(userId) {
  const u = db.users.find((x) => x.id === userId);
  if (u) u.lastLogin = new Date();
}

module.exports = {
  mode: 'memory',
  reset,
  getActiveStocks, getStockBySymbol, upsertStock, deactivateStock,
  saveQuote, saveHistory, getHistory, saveRecommendation,
  getDashboard, getRecommendationHistory,
  startSyncLog, finishSyncLog, getLastSync,
  findUserByEmail, createUser, touchLogin,
};
