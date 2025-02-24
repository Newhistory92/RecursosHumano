const { getConnection } = require('../config/configbd');
const sql = require('mssql');
const moment = require('moment');

class HorasService {
  constructor() {
    this.HORAS_POR_CONDICION = {
      'Contratado': 6,
      'Planta_Permanente': 7
    };
    this.TOLERANCIA_MINUTOS = 15;
  }

  async registrarHorasTrabajadas(operadorId, horaEntradaReal, horasTotales, condicionLaboral) {
    try {
      console.log("🚀 operadorId:", operadorId);
      console.log("🚀 horaEntrada enviada:", horaEntradaReal);
      console.log("🚀 horasTotales:", horasTotales);
      console.log("🚀 condicionLaboral:", condicionLaboral);
  
      const pool = await getConnection();
  
      // Obtener hora de entrada y horas extra desde la BD
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`SELECT horaEntrada, horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
  
      if (!result.recordset[0]) {
        throw new Error(`No se encontró registro de horas para operadorId: ${operadorId}`);
      }
  
      let { horaEntrada, horasExtra: horasExtraActuales = 0 } = result.recordset[0];
      horaEntrada = moment(horaEntrada).format('HH:mm:ss');
      console.log(`Hora de entrada configurada: ${horaEntrada}`);
  
      // Calcular minutos debidos
      const minutosDebidos = this.calcularMinutosDebidos(horaEntradaReal, horaEntrada);
      console.log(`Minutos debidos: ${minutosDebidos}`);
  
      // Obtener horas requeridas según condición
      const horasRequeridas = this.HORAS_POR_CONDICION[condicionLaboral] || 8;
      console.log(`Horas requeridas para ${condicionLaboral}: ${horasRequeridas}`);
  
      // Convertir horasTotales de "HH:mm" a decimal
      const [horas, minutos] = horasTotales.split(':').map(Number);
      const horasTotalesDecimal = horas + (minutos / 60);
      console.log(`Horas trabajadas en decimal: ${horasTotalesDecimal}`);
  
      // Calcular diferencia entre horas trabajadas y requeridas
      const diferencia = horasTotalesDecimal - horasRequeridas;
      console.log(`Diferencia de horas: ${diferencia}`);
  
      // Ajustar horas extra
      let horasExtraFinales = horasExtraActuales;
      if (diferencia > 0) {
        horasExtraFinales += diferencia;
      } else if (diferencia < 0) {
        horasExtraFinales = Math.max(0, horasExtraFinales + diferencia);
      }
      console.log(`Horas extra finales: ${horasExtraFinales}`);
  
      // Actualizar horas extra en la BD
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('horasExtra', sql.Float, horasExtraFinales)
        .query(`UPDATE HorasTrabajadas SET horasExtra = @horasExtra, updatedAt = GETDATE() WHERE operadorId = @operadorId`);
  
      return {
        operadorId,
        minutosDebidos,
        horasRequeridas,
        horasTotalesDecimal,
        horasExtra: horasExtraFinales
      };
  
    } catch (error) {
      console.error('Error en registrarHorasTrabajadas:', error);
      throw error;
    }
  }
  
  calcularMinutosDebidos(horaEntradaReal, horaEntradaConfigurada) {
    const entrada = moment(horaEntradaReal, 'HH:mm:ss');
    const configurada = moment(horaEntradaConfigurada, 'HH:mm:ss');
    const tolerancia = configurada.clone().add(15, 'minutes');
  
    if (entrada.isSameOrBefore(tolerancia)) {
      return 0; // Dentro del margen de tolerancia
    }
  
    return entrada.diff(configurada, 'minutes');
  }
  

}

module.exports = new HorasService();