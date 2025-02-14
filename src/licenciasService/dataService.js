const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const cacheService = require('./cacheService');
const { QUERIES } = require('../utils/queries');
class DataService {
  constructor() {
    this.CACHE_KEYS = {
      PERSONAL: 'personal:',
      CONFIG: 'config:',
      LICENCIAS: 'licencias:',
      USO_LICENCIAS: 'uso:'
    };
  }

  async loadPersonalData(operadorId) {
    const cacheKey = `${this.CACHE_KEYS.PERSONAL}${operadorId}`;
    let personalData = cacheService.get(cacheKey);

    if (!personalData) {
      const pool = await getConnection();
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(QUERIES.getPersonalInfo);

      if (!result.recordset[0]) {
        throw new Error('Operador no encontrado');
      }

      personalData = result.recordset[0];
      cacheService.set(cacheKey, personalData);
    }

    return personalData;
  }

  async loadConfiguracion(condicionLaboral) {
    const cacheKey = `${this.CACHE_KEYS.CONFIG}${condicionLaboral}`;
    let config = cacheService.get(cacheKey);

    if (!config) {
      const pool = await getConnection();
      const result = await pool.request()
        .input('condicionLaboral', sql.VarChar(50), condicionLaboral)
        .query(QUERIES.getConfigPersonal);

      if (!result.recordset[0]) {
        throw new Error(`No se encontró configuración para: ${condicionLaboral}`);
      }

      config = result.recordset[0];
      cacheService.set(cacheKey, config);
    }

    return config;
  }

  async loadLicenciasData(operadorId, tipo, anio) {
    const cacheKey = `${this.CACHE_KEYS.LICENCIAS}${operadorId}:${tipo}:${anio}`;
    let licenciasData = cacheService.get(cacheKey);

    if (!licenciasData) {
      const pool = await getConnection();
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .query(QUERIES.getTotalUsado);

      licenciasData = result.recordset[0];
      cacheService.set(cacheKey, licenciasData);
    }

    return licenciasData;
  }

  async loadHistorialLicencias(operadorId, tipo, anioActual) {
    const cacheKey = `${this.CACHE_KEYS.LICENCIAS}historial:${operadorId}:${tipo}`;
    let historial = cacheService.get(cacheKey);

    if (!historial) {
      const pool = await getConnection();
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anioActual', sql.Int, anioActual)
        .query(QUERIES.getHistorialLicencias);

      historial = result.recordset;
      cacheService.set(cacheKey, historial);
    }

    return historial;
  }

  invalidateOperadorCache(operadorId) {
    cacheService.invalidatePattern(`.*${operadorId}.*`);
  }

  invalidateConfigCache(condicionLaboral) {
    cacheService.delete(`${this.CACHE_KEYS.CONFIG}${condicionLaboral}`);
  }
}

module.exports = new DataService();