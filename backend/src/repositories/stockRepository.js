// Selector de la capa de datos.
//  - Con DB_HOST configurado (equipo local / servidor con MySQL) -> MySQL.
//  - Sin DB_HOST (por ejemplo en Vercel sin base de datos externa) -> memoria.
// Ambos repositorios exponen exactamente las mismas funciones.
require('dotenv').config();

const useMemory = process.env.DATA_STORE === 'memory' || (!process.env.DB_HOST && process.env.DATA_STORE !== 'mysql');

module.exports = useMemory ? require('./memoryStockRepository') : require('./mysqlStockRepository');
