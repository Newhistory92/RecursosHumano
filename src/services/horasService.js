const { getConnection } = require('../config/configbd');
const sql = require('mssql');
const moment = require('moment');
const { HORAS_POR_CONDICION } = require('../utils/type');

class HorasService {
  constructor() {
    this.HORAS_POR_CONDICION = {
      'Contratado': 6,
      'Planta_Permanente': 7
    };
    this.TOLERANCIA_MINUTOS = 15;
  }

  calcularMinutosDebidos(horaEntrada, horaEntradaEsperada) {
    if (!horaEntradaEsperada) return 0;
    const entrada = new Date(horaEntrada);
    const esperada = new Date(horaEntradaEsperada);
    return entrada > esperada ? Math.round((entrada - esperada) / (1000 * 60)) : 0;
  }

  calcularHorasExtra(horaEntrada, horaSalida, horasRequeridas) {
    const entrada = moment(horaEntrada, 'HH:mm:ss');
    const salida = moment(horaSalida, 'HH:mm:ss');
    
    // Si no hay marca de salida, retornar solo los minutos debidos por llegada tarde
    if (!horaSalida) {
      const minutosDebidos = this.calcularMinutosDebidos(horaEntrada, '07:00:00');
      return -(minutosDebidos / 60);
    }

    const horasTrabajadas = salida.diff(entrada, 'hours', true);
    const diferencia = horasTrabajadas - horasRequeridas;

    // Restar minutos debidos por llegada tarde
    const minutosDebidos = this.calcularMinutosDebidos(horaEntrada, '07:00:00');
    return diferencia - (minutosDebidos / 60);
  }

  async obtenerHorasRequeridas(operadorId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('operadorId', sql.VarChar, operadorId)
      .query(`
        SELECT condicionLaboral
        FROM Personal
        WHERE operadorId = @operadorId
      `);

    if (!result.recordset[0]) {
      throw new Error('Operador no encontrado');
    }

    const { condicionLaboral } = result.recordset[0];
    return this.HORAS_POR_CONDICION[condicionLaboral] || null;
  }

  async registrarHorasTrabajadas(operadorId, primerRegistro, horasTotales, condicionLaboral) {
    try {
      const pool = await getConnection();

      // 1. Obtener hora de entrada configurada y horas extra actuales
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT horaEntrada, horasExtra
          FROM HorasTrabajadas
          WHERE operadorId = @operadorId
        `);

      if (!result.recordset[0]) {
        throw new Error(`No se encontró configuración para el operador ${operadorId}`);
      }

      const { horaEntrada, horasExtra = 0 } = result.recordset[0];

      // 2. Calcular minutos de retraso
      const minutosDebidos = this.calcularMinutosDebidos(horaEntrada, primerRegistro);
      const horasDebidas = minutosDebidos / 60; // Convertir minutos a horas

      // 3. Obtener horas requeridas según condición laboral
      const horasRequeridas = HORAS_POR_CONDICION[condicionLaboral] || 8;

      // 4. Calcular diferencia entre horas trabajadas y requeridas
      let diferencia = horasTotales - horasRequeridas - horasDebidas;

      // 5. Ajustar horas extra
      let nuevasHorasExtra = this.calcularNuevasHorasExtra(horasExtra, diferencia);

      // 6. Actualizar registro
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('horasExtra', sql.Float, nuevasHorasExtra)
        .input('minutosDebidos', sql.Int, minutosDebidos)
        .query(`
          UPDATE HorasTrabajadas
          SET horasExtra = @horasExtra,
              minutosDebidos = @minutosDebidos,
              updatedAt = GETDATE()
          WHERE operadorId = @operadorId
        `);

      return {
        operadorId,
        minutosDebidos,
        horasTotales,
        horasRequeridas,
        horasExtra: nuevasHorasExtra
      };

    } catch (error) {
      console.error('Error en registrarHorasTrabajadas:', error);
      throw error;
    }
  }

  calcularNuevasHorasExtra(horasExtraActuales, diferencia) {
    // Si la diferencia es positiva, sumar a las horas extra
    if (diferencia > 0) {
      return horasExtraActuales + diferencia;
    }

    // Si la diferencia es negativa, intentar compensar con horas extra existentes
    if (horasExtraActuales > 0) {
      // Si hay suficientes horas extra para compensar
      if (horasExtraActuales >= Math.abs(diferencia)) {
        return horasExtraActuales + diferencia;
      }
      // Si no hay suficientes horas extra, quedan en negativo
      return 0;
    }

    // Si no hay horas extra y la diferencia es negativa, acumular en negativo
    return horasExtraActuales + diferencia;
  }

  async obtenerResumenSemanal(operadorId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('operadorId', sql.VarChar, operadorId)
      .query(`
        SELECT 
          FORMAT(horaEntrada, 'yyyy-MM-dd') as fecha,
          FORMAT(horaEntrada, 'HH:mm:ss') as entrada,
          FORMAT(horaSalida, 'HH:mm:ss') as salida,
          horasExtra
        FROM HorasTrabajadas
        WHERE operadorId = @operadorId
        AND horaEntrada >= DATEADD(day, -7, GETDATE())
        ORDER BY horaEntrada DESC
      `);

    return result.recordset;
  }
}

module.exports = new HorasService(); 