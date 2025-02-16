const { getConnection } = require('../config/configbd');
const sql = require('mssql');
const moment = require('moment');
const accessDBService = require('./accessDBService');
const horasService = require('./horasService');

class SincronizacionService {
  async obtenerOperadoresPorIdReloj(idReloj) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('idReloj', sql.VarChar, idReloj)
      .query(`
        SELECT operadorId, idReloj, condicionLaboral
        FROM Personal
        WHERE idReloj = @idReloj
      `);

    return result.recordset;
  }

  async sincronizarRegistrosDiarios() {
    try {
      const fechaHoy = moment().format('YYYY-MM-DD');
      console.log('Iniciando sincronización para la fecha:', fechaHoy);

      // 1. Obtener registros del reloj desde Access
      const registrosAccess = await accessDBService.obtenerRegistrosDelDia(fechaHoy);
      console.log(`Registros obtenidos de Access: ${registrosAccess.length}`);

      // 2. Procesar cada registro
      for (const registro of registrosAccess) {
        const operadores = await this.obtenerOperadoresPorIdReloj(registro.IdReloj);
        
        if (operadores.length === 0) {
          console.log(`No se encontró operador para el IdReloj: ${registro.IdReloj}`);
          continue;
        }

        for (const operador of operadores) {
          try {
            // 3. Registrar horas trabajadas
            await horasService.registrarHorasTrabajadas(
              operador.operadorId,
              registro.Fecha,
              registro.HoraEntrada,
              registro.HoraSalida
            );

            console.log(`Registro procesado para operador: ${operador.operadorId}`);
          } catch (error) {
            console.error(`Error procesando registro para operador ${operador.operadorId}:`, error);
          }
        }
      }

      console.log('Sincronización completada exitosamente');
      return {
        success: true,
        registrosProcesados: registrosAccess.length
      };
    } catch (error) {
      console.error('Error en la sincronización:', error);
      throw error;
    }
  }

  async obtenerResumenOperador(operadorId) {
    try {
      const resumenSemanal = await horasService.obtenerResumenSemanal(operadorId);
      
      // Calcular totales
      const totales = resumenSemanal.reduce((acc, reg) => {
        acc.horasExtra += reg.horasExtra || 0;
        return acc;
      }, { horasExtra: 0 });

      return {
        registros: resumenSemanal.map(reg => ({
          ...reg,
          horasExtra: reg.horasExtra?.toFixed(2),
          estado: reg.horasExtra < 0 ? 'DEBE' : reg.horasExtra > 0 ? 'FAVOR' : 'COMPLETO'
        })),
        totales: {
          horasExtra: totales.horasExtra.toFixed(2),
          estado: totales.horasExtra < 0 ? 'DEBE' : totales.horasExtra > 0 ? 'FAVOR' : 'COMPLETO'
        }
      };
    } catch (error) {
      console.error('Error obteniendo resumen del operador:', error);
      throw error;
    }
  }
}

module.exports = new SincronizacionService(); 