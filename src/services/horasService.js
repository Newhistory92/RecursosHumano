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

  calcularMinutosDebidos(horaEntradaReal, horaEntradaEsperada) {
    const entrada = moment(horaEntradaReal, 'HH:mm:ss');
    const esperada = moment(horaEntradaEsperada, 'HH:mm:ss');
    const tolerancia = esperada.clone().add(this.TOLERANCIA_MINUTOS, 'minutes');

    if (entrada.isSameOrBefore(tolerancia)) {
      return 0;
    }

    return entrada.diff(tolerancia, 'minutes');
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

  async registrarHorasTrabajadas(operadorId, fecha, horaEntrada, horaSalida) {
    const pool = await getConnection();
    const horasRequeridas = await this.obtenerHorasRequeridas(operadorId);
    const horasExtra = this.calcularHorasExtra(horaEntrada, horaSalida, horasRequeridas || 0);

    await pool.request()
      .input('operadorId', sql.VarChar, operadorId)
      .input('fecha', sql.Date, fecha)
      .input('horaEntrada', sql.Time, horaEntrada)
      .input('horaSalida', sql.Time, horaSalida)
      .input('horasExtra', sql.Float, horasExtra)
      .query(`
        INSERT INTO HorasTrabajadas (
          operadorId, horaEntrada, horaSalida, 
          horasExtra, createdAt, updatedAt
        )
        VALUES (
          @operadorId, @horaEntrada, @horaSalida,
          @horasExtra, GETDATE(), GETDATE()
        )
      `);

    return {
      operadorId,
      fecha,
      horaEntrada,
      horaSalida,
      horasExtra,
      horasRequeridas
    };
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