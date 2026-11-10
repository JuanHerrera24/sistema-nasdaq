// Acceso a datos (MySQL). Todas las consultas usan parámetros (?) para evitar inyección SQL.
const { pool } = require('../config/db');

const num = (v) => (v == null ? null : Number(v));

async function getActiveStocks() {
  const [rows] = await pool.query('SELECT id, symbol, name FROM stocks WHERE active = 1 ORDER BY symbol');
  return rows;
}

async function getStockBySymbol(symbol) {
  const [rows] = await pool.query('SELECT * FROM stocks WHERE symbol = ?', [symbol]);
  return rows[0] || null;
}

async function upsertStock({ symbol, name, exchange, currency }) {
  await pool.query(
    `INSERT INTO stocks (symbol, name, exchange, currency) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), exchange = VALUES(exchange), currency = VALUES(currency), active = 1`,
    [symbol, (name || symbol).slice(0, 120), (exchange || '').slice(0, 30), (currency || 'USD').slice(0, 3)]
  );
  return getStockBySymbol(symbol);
}

async function deactivateStock(symbol) {
  const [res] = await pool.query('UPDATE stocks SET active = 0 WHERE symbol = ?', [symbol]);
  return res.affectedRows > 0;
}

async function saveQuote(stockId, q) {
  await pool.query(
    `INSERT INTO quotes (stock_id, price, previous_close, change_amount, change_percent, day_high, day_low, volume, market_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE price = VALUES(price), previous_close = VALUES(previous_close),
       change_amount = VALUES(change_amount), change_percent = VALUES(change_percent),
       day_high = VALUES(day_high), day_low = VALUES(day_low), volume = VALUES(volume), market_time = VALUES(market_time)`,
    [stockId, q.price, q.previousClose, q.change, q.changePercent, q.dayHigh, q.dayLow, q.volume,
      q.marketTime ? new Date(q.marketTime) : null]
  );
}

async function saveHistory(stockId, history) {
  if (!history.length) return;
  const values = history.map((d) => [stockId, d.date, d.open, d.high, d.low, d.close, d.volume]);
  await pool.query(
    `INSERT INTO price_history (stock_id, trade_date, open_price, high_price, low_price, close_price, volume)
     VALUES ?
     ON DUPLICATE KEY UPDATE open_price = VALUES(open_price), high_price = VALUES(high_price),
       low_price = VALUES(low_price), close_price = VALUES(close_price), volume = VALUES(volume)`,
    [values]
  );
}

async function getHistory(stockId, days = 365) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(trade_date, '%Y-%m-%d') AS date, open_price, high_price, low_price, close_price, volume
     FROM price_history
     WHERE stock_id = ? AND trade_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY trade_date`,
    [stockId, days]
  );
  return rows.map((r) => ({
    date: r.date,
    open: num(r.open_price),
    high: num(r.high_price),
    low: num(r.low_price),
    close: num(r.close_price),
    volume: num(r.volume),
  }));
}

async function saveRecommendation(stockId, analysis) {
  const i = analysis.indicators;
  await pool.query(
    `INSERT INTO recommendations (stock_id, recommendation, score, price, sma20, sma50, rsi14, volatility, reasons)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [stockId, analysis.recommendation, analysis.score, i.price, i.sma20, i.sma50, i.rsi14, i.volatility,
      analysis.reasons.join(' | ').slice(0, 1000)]
  );
}

// Panel general: cada acción con su última cotización y su última recomendación
async function getDashboard() {
  const [rows] = await pool.query(
    `SELECT s.symbol, s.name, s.exchange, q.price, q.change_amount, q.change_percent, q.volume, q.market_time, q.fetched_at,
            r.recommendation, r.score, r.rsi14, r.created_at AS reco_at
     FROM stocks s
     LEFT JOIN quotes q ON q.stock_id = s.id
     LEFT JOIN recommendations r ON r.id = (
       SELECT id FROM recommendations WHERE stock_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1)
     WHERE s.active = 1
     ORDER BY s.symbol`
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    price: num(r.price),
    change: num(r.change_amount),
    changePercent: num(r.change_percent),
    volume: num(r.volume),
    marketTime: r.market_time,
    fetchedAt: r.fetched_at,
    recommendation: r.recommendation,
    score: num(r.score),
    rsi14: num(r.rsi14),
  }));
}

async function getRecommendationHistory(stockId, limit = 30) {
  const [rows] = await pool.query(
    `SELECT recommendation, score, price, rsi14, created_at FROM recommendations
     WHERE stock_id = ? ORDER BY created_at DESC LIMIT ?`,
    [stockId, limit]
  );
  return rows.map((r) => ({ ...r, score: num(r.score), price: num(r.price), rsi14: num(r.rsi14) }));
}

async function startSyncLog() {
  const [res] = await pool.query('INSERT INTO sync_log (started_at) VALUES (UTC_TIMESTAMP())');
  return res.insertId;
}

async function finishSyncLog(id, ok, fail, message) {
  await pool.query(
    'UPDATE sync_log SET finished_at = UTC_TIMESTAMP(), symbols_ok = ?, symbols_fail = ?, message = ? WHERE id = ?',
    [ok, fail, (message || '').slice(0, 1000), id]
  );
}

async function getLastSync() {
  const [rows] = await pool.query('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

module.exports = {
  mode: 'mysql',
  getActiveStocks, getStockBySymbol, upsertStock, deactivateStock,
  saveQuote, saveHistory, getHistory, saveRecommendation,
  getDashboard, getRecommendationHistory,
  startSyncLog, finishSyncLog, getLastSync,
};
