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


  async justificarAusencia(ausenciaId, justificado, condicionLaboral, fecha, operadorId) {
    try {
      // Validaciones iniciales
      if (!operadorId || typeof justificado !== 'boolean' || !condicionLaboral || !fecha) {
        return { error: 'Faltan parámetros: operadorId, fecha, justificado y condicionLaboral son requeridos', status: 400 };
      }
    
      console.log(`📌 Iniciando actualización de ausencia para operador ${operadorId} en la fecha ${fecha} a justificado = ${justificado}`);
    
      const pool = await getConnection();
      // Convertir la fecha a formato YYYY-MM-DD para la comparación
      const fechaStr = new Date(fecha).toISOString().split('T')[0];
    
      // Verificar si ya existe una ausencia para ese operador y esa fecha
      const checkResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('fecha', sql.Date, fechaStr)
        .query(`
          SELECT TOP 1 id 
          FROM HistorialAusencias 
          WHERE operadorId = @operadorId 
            AND CONVERT(date, fecha) = @fecha
        `);
    
      if (checkResult.recordset.length > 0) {
        // Si existe, actualizar el registro existente
        const existingAusenciaId = checkResult.recordset[0].id;
        console.log(`🔍 Se encontró una ausencia existente (ID: ${existingAusenciaId}) para la fecha ${fechaStr}. Actualizando...`);
    
        await pool.request()
          .input('ausenciaId', sql.Int, existingAusenciaId)
          .input('justificado', sql.Bit, justificado)
          .query(`
            UPDATE HistorialAusencias
            SET justificado = @justificado, updatedAt = GETDATE()
            WHERE id = @ausenciaId
          `);
        console.log(`✅ Ausencia (ID: ${existingAusenciaId}) actualizada correctamente`);
      } else {
        // Si no existe, insertar un nuevo registro
        console.log(`🔍 No se encontró ausencia para operador ${operadorId} en la fecha ${fechaStr}. Insertando nueva...`);
    
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('fecha', sql.Date, fechaStr)
          .input('justificado', sql.Bit, justificado)
          .query(`
            INSERT INTO HistorialAusencias (operadorId, fecha, justificado, createdAt, updatedAt)
            VALUES (@operadorId, @fecha, @justificado, GETDATE(), GETDATE())
          `);
        console.log(`✅ Ausencia insertada para operador ${operadorId} en la fecha ${fechaStr}`);
      }
    
      // Si la ausencia se marcó como justificada, ajustar las horas extra
      if (justificado) {
        console.log(`📌 Ajustando horas extra para operador ${operadorId}`);
    
        const resHoras = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .query(`
            SELECT horasExtra 
            FROM HorasTrabajadas 
            WHERE operadorId = @operadorId
          `);
    
        let horasExtraActuales = resHoras.recordset[0] ? parseFloat(resHoras.recordset[0].horasExtra) : 0;
        console.log(`⏳ Horas extra actuales: ${horasExtraActuales}`);
    
        const HORAS_POR_CONDICION = {
          'Contratado': 6,
          'Planta_Permanente': 7
        };
        const penalizacion = HORAS_POR_CONDICION[condicionLaboral] || 8;
        console.log(`💼 Penalización de ${penalizacion} horas`);
    
        let nuevasHorasExtra;
        if (horasExtraActuales >= 0) {
          nuevasHorasExtra = horasExtraActuales - penalizacion;
        } else {
          nuevasHorasExtra = horasExtraActuales + penalizacion;
        }
        console.log(`🕒 Nuevas horasExtra: ${nuevasHorasExtra}`);
    
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('horasExtra', sql.Decimal(10, 2), nuevasHorasExtra)
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