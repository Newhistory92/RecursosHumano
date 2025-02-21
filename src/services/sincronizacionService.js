const moment = require('moment');
const accessDBService = require('./accessDBService');
const horasService = require('./horasService');
const sql = require('mssql');
const { getConnection } = require('../config/configbd'); 

class SincronizacionService {
  
  async obtenerOperadoresPorIdReloj(id) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('idReloj', sql.VarChar, id)
        .query(`
          SELECT operadorId, condicionLaboral
          FROM Personal
          WHERE idReloj = @idReloj
        `);

      return result.recordset;
    } catch (error) {
      console.error(`Error obteniendo operadores para idReloj ${id}:`, error);
      throw error;
    }
  }

  async sincronizarRegistrosDiarios() {
    try {
      // Obtener registros desde Access
      const logs = await accessDBService.getSystemLogsPorDia();
      
      if (!logs.length) {
        console.log("No hay registros para sincronizar.");
        return;
      }

      // Agrupar registros por ID y ordenarlos por LogTime
      const registrosPorId = {};
      logs.forEach(log => {
        if (!registrosPorId[log.id]) {
          registrosPorId[log.id] = [];
        }
        registrosPorId[log.id].push({
          ...log,
          logTime: new Date(log.logTime)
        });
      });

      // Procesar cada grupo de registros
      for (const [id, registros] of Object.entries(registrosPorId)) {
        // Ordenar registros por tiempo
        registros.sort((a, b) => a.logTime - b.logTime);
        
        // Obtener operador asociado al ID del reloj
        const operadores = await this.obtenerOperadoresPorIdReloj(id);
        
        if (!operadores.length) {
          console.log(`No se encontró operador para el ID de reloj: ${id}`);
          continue;
        }

        // Calcular horas trabajadas
        let horasTotales = 0;
        for (let i = 0; i < registros.length - 1; i += 2) {
          const entrada = registros[i].logTime;
          const salida = registros[i + 1]?.logTime;
          
          if (salida) {
            const diferencia = (salida - entrada) / (1000 * 60 * 60); // Convertir a horas
            horasTotales += diferencia;
          }
        }

        // Para cada operador encontrado con ese ID de reloj
        for (const operador of operadores) {
          const { operadorId, condicionLaboral } = operador;
          const primerRegistro = registros[0].logTime;

          // Registrar las horas trabajadas
          await horasService.registrarHorasTrabajadas(
            operadorId,
            moment(primerRegistro).format('HH:mm:ss'),
            horasTotales,
            condicionLaboral
          );
        }
      }

      console.log("Sincronización completada exitosamente");
    } catch (error) {
      console.error("Error sincronizando registros diarios:", error);
      throw error;
    }
  }

  async obtenerResumenOperador(operadorId) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT 
            idReloj,
            fecha,
            horaEntrada,
            horaSalida
          FROM registrarHorasTrabajadas
          WHERE idReloj IN (
            SELECT idReloj 
            FROM Personal 
            WHERE operadorId = @operadorId
          )
          ORDER BY fecha DESC
        `);

      return {
        registros: result.recordset.map(reg => ({
          ...reg,
          fecha: moment(reg.fecha).format('YYYY-MM-DD'),
          horaEntrada: reg.horaEntrada ? moment(reg.horaEntrada, 'HH:mm:ss').format('HH:mm') : null,
          horaSalida: reg.horaSalida ? moment(reg.horaSalida, 'HH:mm:ss').format('HH:mm') : null
        }))
      };
    } catch (error) {
      console.error('Error obteniendo resumen del operador:', error);
      throw error;
    }
  }
}

module.exports = new SincronizacionService();
