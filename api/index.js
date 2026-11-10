// Función serverless de Vercel: expone la misma API Express del backend.
// El frontend lo sirve Vercel como archivos estáticos (ver vercel.json).
module.exports = require('../backend/src/app');
