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

 
 
  async loadHistorialLicencias(operadorId, anioActual) {
    const cacheKey = `${this.CACHE_KEYS.LICENCIAS}historial:${operadorId}`;
    let historial = cacheService.get(cacheKey);

    if (!historial) {
      const pool = await getConnection();
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('anioActual', sql.Int, anioActual)
        .query(QUERIES.getHistorialLicencias);

      historial = this.formatHistorialLicencias(result.recordset);
console.log(historial)
      cacheService.set(cacheKey, historial);
    }

    return historial;
  }

  formatHistorialLicencias(records) {
    return records.map(record => ({
      licencia: {
        id: record.licenciaId,
        fechaInicio: record.fechaInicio,
        fechaFin: record.fechaFin,
        cantidad: record.cantidad,
        tipo: record.tipo,
        estado: record.estado,
        anio: record.anio,
        createdAt: record.licenciaCreatedAt,
        updatedAt: record.licenciaUpdatedAt
      },
      operador: {
        sexo: record.sexo
      },
      usoLicencia: {
        id: record.usoLicenciaId,
        totalUsado: record.totalUsado,
        tipo: record.tipo,
        anio: record.anio,
        createdAt: record.usoLicenciaCreatedAt,
        updatedAt: record.usoLicenciaUpdatedAt
      },
      personal: {
        diasLicenciaAsignados: record.diasLicenciaAsignados,
        condicionLaboral: record.condicionLaboral,
        fechaInicioPlanta: record.fechaInicioPlanta
      }
    }));
  }


  invalidateOperadorCache(operadorId) {
    cacheService.invalidatePattern(`.*${operadorId}.*`);
  }

  
}

module.exports = new DataService();