const sql = require('mssql');
const { getConnection } = require('./configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO } = require('../utils/type');

class ConfigService {
  async calcularDiasSegunAntiguedad(fechaInicioPlanta, condicionLaboral, operadorId) {
    // Si es contratado, retorna el valor fijo
    if (condicionLaboral === 'Contratado') {
      return DIAS_POR_TIPO.Licencia.Contratado;
    }

    const hoy = new Date();
    const inicio = new Date(fechaInicioPlanta);
    const mesesAntiguedad = (hoy.getFullYear() - inicio.getFullYear()) * 12 + 
                           (hoy.getMonth() - inicio.getMonth());
    
    let diasCalculados;
    
    // Calcular días según antigüedad
    if (hoy.getFullYear() === inicio.getFullYear()) {
      const mesesRestantes = 12 - inicio.getMonth();
      diasCalculados = Math.floor((10 * mesesRestantes) / 12);
    } else {
      const añosAntiguedad = mesesAntiguedad / 12;
      if (mesesAntiguedad < 6) diasCalculados = 0;
      else if (añosAntiguedad <= 5) diasCalculados = 10;
      else if (añosAntiguedad <= 10) diasCalculados = 15;
      else if (añosAntiguedad <= 20) diasCalculados = 25;
      else diasCalculados = 30;
    }

    // Actualizar la tabla Personal
    try {
      const pool = await getConnection();
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('diasLicenciaAsignados', sql.Int, diasCalculados)
        .query(QUERIES.updateDiasAsignados);
    } catch (error) {
      console.error('Error actualizando diasLicenciaAsignados:', error);
      throw error;
    }

    return diasCalculados;
  }
}
module.exports = new ConfigService();