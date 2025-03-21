const { getConnection } = require('../config/configbd');
const sql = require('mssql');
const moment = require('moment');

class HorasService {
  constructor() {
    this.HORAS_POR_CONDICION = {
      'Contratado': 6,
      'Planta_Permanente': 7,
      'Comisionado': null
    };
    this.TOLERANCIA_MINUTOS = 15;
  }

  async registrarHorasTrabajadas(operadorId, horaEntradaReal, horasTotales, condicionLaboral) {
    try {
      console.log("🚀 operadorId:", operadorId);
      console.log("🚀 horaEntrada enviada:", horaEntradaReal);
      console.log("🚀 horasTotales en decimal:", horasTotales);
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
      horaEntrada = moment(horaEntrada).format('HH:mm');
      console.log(`Hora de entrada configurada: ${horaEntrada}`);
  
      // Calcular minutos debidos
      const minutosDebidos = this.calcularMinutosDebidos(horaEntradaReal, horaEntrada);
      console.log(`Minutos debidos: ${minutosDebidos}`);
  
      // Obtener horas requeridas según condición
      const horasRequeridas = this.HORAS_POR_CONDICION[condicionLaboral];
      console.log(`Horas requeridas para ${condicionLaboral}: ${horasRequeridas}`);
  
      // Validar que horasTotales sea un número
      if (typeof horasTotales !== 'number' || isNaN(horasTotales)) {
        throw new Error(`Valor inválido en horasTotales: ${horasTotales}`);
      }
  
      // Calcular diferencia entre horas trabajadas y requeridas
      const diferencia = horasTotales - horasRequeridas;
      console.log(`Diferencia de horas: ${diferencia}`);
  
      // Ajustar horas extra
      let horasExtraFinales = horasExtraActuales;
        if (diferencia > 0) {
            horasExtraFinales += diferencia; // Sumar si trabajó más horas

        } else if (diferencia < 0) {
      if (condicionLaboral === "Comisionado") {
        // Para Comisionado, las horas extra se suman solamente; si la diferencia es negativa, se ignora
        console.log("Condición 'Comisionado': diferencia negativa ignorada.");
      } else {
            horasExtraFinales = horasExtraActuales + diferencia; // Ahora permite valores negativos
        }
      }
      console.log(`Horas extra finales: ${horasExtraFinales}`);

      // Actualizar horas extra en la BD
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('horasExtra', sql.Float, horasExtraFinales)
        .query(`UPDATE HorasTrabajadas SET horasExtra = @horasExtra, updatedAt = GETDATE() WHERE operadorId = @operadorId`);
  
        if (diferencia !== 0) {
          const fechaActual = moment().format('YYYY-MM-DD HH:mm:ss');
          await pool.request()
              .input('operadorId', sql.VarChar, operadorId)
              .input('fecha', sql.DateTime, fechaActual)
              .input('horas', sql.Float, diferencia)
              .query(`INSERT INTO RegistroHorasDiarias (operadorId, fecha, horas, updatedAt) VALUES (@operadorId, @fecha, @horas, GETDATE())`);
         
      } 


      return {
        operadorId,
        minutosDebidos,
        horasRequeridas,
        horasTrabajadas: horasTotales, // Mantiene la nomenclatura clara
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


  
  async justificarAusencia(ausenciaId, justificado, condicionLaboral, fechaJustificada, operadorId) {
    try {
      // Validaciones iniciales
      if (!ausenciaId || typeof justificado !== 'boolean' || !condicionLaboral || !operadorId) {
        return { error: 'Faltan parámetros: ausenciaId, justificado, condicionLaboral y operadorId son requeridos', status: 400 };
      }
  
      console.log(`📌 Actualizando ausencia ${ausenciaId} a justificado = ${justificado}`);
  
      const pool = await getConnection();
  
      // ✅ Actualizar la ausencia en la base de datos
      await pool.request()
        .input('ausenciaId', sql.Int, ausenciaId)
        .input('justificado', sql.Bit, justificado)
        .query(`
          UPDATE HistorialAusencias
          SET justificado = @justificado
          WHERE id = @ausenciaId
        `);
  
      console.log(`✅ Ausencia ${ausenciaId} actualizada en HistorialAusencias`);
  
      // Si la ausencia se marcó como justificada, ajustar las horas extra
      if (justificado) {
        console.log(`📌 Ajustando horas extra para operador ${operadorId}`);
  
        // 🔹 Obtener las horas extra actuales del operador
        const resHoras = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .query(`
            SELECT horasExtra 
            FROM HorasTrabajadas 
            WHERE operadorId = @operadorId
          `);
  
        let horasExtraActuales = resHoras.recordset[0] ? parseFloat(resHoras.recordset[0].horasExtra) : 0;
        console.log(`⏳ Horas extra actuales: ${horasExtraActuales}`);
  
        // 🔹 Definir la penalización según la condición laboral
        const HORAS_POR_CONDICION = {
          'Contratado': 6,
          'Planta_Permanente': 7
        };
        const penalizacion = HORAS_POR_CONDICION[condicionLaboral] || 8;
        console.log(`💼 Penalización de ${penalizacion} horas`);
  
        // 🔹 Calcular las nuevas horas extra
        let nuevasHorasExtra;
        if (horasExtraActuales >= 0) {
          // Si las horas extra son positivas, se restan
          nuevasHorasExtra = horasExtraActuales - penalizacion;
        } else {
          // Si las horas extra son negativas, se suman
          nuevasHorasExtra = horasExtraActuales + penalizacion;
        }
        console.log(`🕒 Nuevas horasExtra: ${nuevasHorasExtra}`);
  
        // 🔹 Actualizar la tabla HorasTrabajadas con el nuevo valor de horasExtra
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('horasExtra', sql.Decimal(10, 2), nuevasHorasExtra) // Usar DECIMAL para precisión
          .query(`
            UPDATE HorasTrabajadas 
            SET horasExtra = @horasExtra, updatedAt = GETDATE()
            WHERE operadorId = @operadorId
          `);
  
        console.log(`✅ Horas extra actualizadas para operador ${operadorId}`);
      }
  
      return { success: true, message: "Ausencia justificada correctamente" };
    } catch (error) {
      console.error('❌ Error al justificar ausencia:', error);
      return { error: "Error interno del servidor", status: 500 };
    }
  }
  

}

module.exports = new HorasService();