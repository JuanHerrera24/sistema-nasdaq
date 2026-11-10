// Pruebas de la CAPA DE DATOS.
//  1. Pruebas estáticas de database/schema.sql (siempre se ejecutan).
//  2. Pruebas contra un MySQL real (solo con TEST_MYSQL=1; en GitHub Actions
//     se levanta un MySQL 8 automáticamente). Usan la base `DB_NAME`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database', 'schema.sql'), 'utf8');

test('schema.sql crea las 5 tablas del sistema', () => {
  for (const table of ['stocks', 'price_history', 'quotes', 'recommendations', 'sync_log']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `falta la tabla ${table}`);
  }
});

test('schema.sql define límites de caracteres (SP-106) y precios DECIMAL (SP-103)', () => {
  assert.match(schema, /symbol\s+VARCHAR\(10\)/);
  assert.match(schema, /name\s+VARCHAR\(120\)/);
  assert.match(schema, /CHECK \(symbol REGEXP/);
  assert.match(schema, /close_price DECIMAL\(14,4\)/);
  assert.doesNotMatch(schema, /\b(FLOAT|DOUBLE)\b/i, 'los precios no deben usar FLOAT/DOUBLE');
});

test('schema.sql define llaves foráneas con borrado en cascada', () => {
  assert.strictEqual(schema.match(/REFERENCES stocks\(id\) ON DELETE CASCADE/g).length, 3);
});

// ------------------------------------------------------------------
// MySQL real
// ------------------------------------------------------------------
const mysqlEnabled = process.env.TEST_MYSQL === '1';

test.describe('MySQL real', { skip: !mysqlEnabled && 'defina TEST_MYSQL=1 para probar contra MySQL' }, () => {
  let pool;
  let repo;

  test.before(async () => {
    process.env.DATA_STORE = 'mysql';
    ({ pool } = require('../../src/config/db'));
    repo = require('../../src/repositories/stockRepository');
    await pool.query("DELETE FROM stocks WHERE symbol LIKE 'TST%'");
  });

  test.after(async () => {
    await pool.query("DELETE FROM stocks WHERE symbol LIKE 'TST%'");
    await pool.end();
  });

  test('las 5 tablas existen', async () => {
    const [rows] = await pool.query('SHOW TABLES');
    const names = rows.map((r) => Object.values(r)[0]);
    for (const t of ['stocks', 'price_history', 'quotes', 'recommendations', 'sync_log']) assert.ok(names.includes(t), t);
  });

  test('se cargaron las 8 acciones iniciales', async () => {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM stocks WHERE symbol IN ('AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','NFLX')");
    assert.strictEqual(Number(n), 8);
  });

  test('CHECK rechaza símbolos con formato inválido', async () => {
    await assert.rejects(pool.query("INSERT INTO stocks (symbol) VALUES ('tst bad')"), /chk_symbol_format|Check constraint/i);
  });

  test('VARCHAR(10) rechaza símbolos demasiado largos', async () => {
    await assert.rejects(pool.query("INSERT INTO stocks (symbol) VALUES ('TSTDEMASIADOLARGO')"), /too long|Data too long/i);
  });

  test('UNIQUE impide acciones duplicadas', async () => {
    await pool.query("INSERT INTO stocks (symbol) VALUES ('TSTDUP')");
    await assert.rejects(pool.query("INSERT INTO stocks (symbol) VALUES ('TSTDUP')"), /Duplicate entry/);
  });

  test('DECIMAL(14,4) conserva los decimales exactos', async () => {
    const stock = await repo.upsertStock({ symbol: 'TSTDEC', name: 'Decimales' });
    const today = new Date().toISOString().slice(0, 10);
    await repo.saveHistory(stock.id, [{ date: today, open: 1.1, high: 2.2, low: 0.1, close: 1234.5678, volume: 10 }]);
    const [[row]] = await pool.query('SELECT close_price FROM price_history WHERE stock_id = ?', [stock.id]);
    assert.strictEqual(row.close_price, '1234.5678');
  });

  test('el repositorio MySQL cumple el mismo contrato que el de memoria', async () => {
    assert.strictEqual(repo.mode, 'mysql');
    const s = await repo.upsertStock({ symbol: 'TSTREP', name: 'Repo', exchange: 'NasdaqGS', currency: 'USD' });
    await repo.saveQuote(s.id, { price: 10.5, previousClose: 10, change: 0.5, changePercent: 5, marketTime: new Date().toISOString() });
    await repo.saveRecommendation(s.id, { recommendation: 'COMPRAR', score: 40, indicators: { price: 10.5, rsi14: 60 }, reasons: ['prueba'] });
    const dash = (await repo.getDashboard()).find((d) => d.symbol === 'TSTREP');
    assert.strictEqual(dash.price, 10.5);
    assert.strictEqual(dash.recommendation, 'COMPRAR');
    assert.strictEqual(await repo.deactivateStock('TSTREP'), true);
    assert.ok(!(await repo.getActiveStocks()).some((d) => d.symbol === 'TSTREP'));
  });

  test('borrar una acción elimina en cascada su histórico y recomendaciones', async () => {
    const s = await repo.upsertStock({ symbol: 'TSTCAS', name: 'Cascada' });
    await repo.saveRecommendation(s.id, { recommendation: 'VENDER', score: -40, indicators: { price: 1 }, reasons: ['x'] });
    await pool.query('DELETE FROM stocks WHERE id = ?', [s.id]);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM recommendations WHERE stock_id = ?', [s.id]);
    assert.strictEqual(Number(n), 0);
  });
});
