// Conexión a la capa de datos (MySQL) mediante un pool de conexiones
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nasdaq_system',
  waitForConnections: true,
  connectionLimit: 10,
  // Devuelve DECIMAL como texto para no perder precisión; se convierte en el repositorio
  decimalNumbers: false,
  timezone: 'Z',
});

async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}

module.exports = { pool, testConnection };
