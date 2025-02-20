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

  async sincronizarHorasTrabajadas() {
    try {
      console.log('Iniciando sincronización de horas trabajadas...');
      const pool = await getConnection();

      // Obtener todos los registros de SystemLog
      const logs = await accessDBService.getSystemLogsPorDia();

      // Agrupar registros por ID
      const registrosPorId = this.agruparRegistrosPorId(logs);

      // Procesar cada grupo de registros
      for (const [idReloj, registros] of Object.entries(registrosPorId)) {
        if (registros.length >= 2) {
          const horaEntrada = this.extraerHora(registros[0].logTime);
          const horaSalida = this.extraerHora(registros[1].logTime);
          const fecha = this.extraerFecha(registros[0].logTime);

          // Registrar en la base de datos
          await pool.request()
            .input('idReloj', sql.Int, idReloj)
            .input('fecha', sql.Date, fecha)
            .input('horaEntrada', sql.Time, horaEntrada)
            .input('horaSalida', sql.Time, horaSalida)
            .query(`
              MERGE INTO registrarHorasTrabajadas AS target
              USING (VALUES (@idReloj, @fecha, @horaEntrada, @horaSalida)) 
                AS source (idReloj, fecha, horaEntrada, horaSalida)
              ON target.idReloj = source.idReloj 
                AND target.fecha = source.fecha
              WHEN MATCHED THEN
                UPDATE SET 
                  horaEntrada = source.horaEntrada,
                  horaSalida = source.horaSalida,
                  updatedAt = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (idReloj, fecha, horaEntrada, horaSalida, createdAt, updatedAt)
                VALUES (
                  source.idReloj,
                  source.fecha,
                  source.horaEntrada,
                  source.horaSalida,
                  GETDATE(),
                  GETDATE()
                );
            `);

          console.log(`Registros sincronizados para idReloj ${idReloj}: ${fecha} - E: ${horaEntrada}, S: ${horaSalida}`);
        }
      }

      console.log('Sincronización completada exitosamente');
    } catch (error) {
      console.error('Error en la sincronización:', error);
      throw error;
    }
  }

  agruparRegistrosPorId(logs) {
    const grupos = {};
    
    for (const log of logs) {
      if (!grupos[log.id]) {
        grupos[log.id] = [];
      }
      grupos[log.id].push(log);
    }

    return grupos;
  }

  extraerHora(fechaISO) {
    if (!fechaISO) return null;
    const fecha = new Date(fechaISO);
    return fecha.toTimeString().split(' ')[0];
  }

  extraerFecha(fechaISO) {
    if (!fechaISO) return null;
    const fecha = new Date(fechaISO);
    return fecha.toISOString().split('T')[0];
  }
}

module.exports = new SincronizacionService(); 