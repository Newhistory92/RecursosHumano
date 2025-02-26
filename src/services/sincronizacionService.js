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

  async sincronizarRegistrosDiarios(fecha) {
    try { 
     

      // Obtener registros desde Access
      const logs = await accessDBService.getSystemLogsPorDia(fecha);

      
      if (!logs.length) {
        console.log("No hay registros para sincronizar.");
        return;
      }

      // Agrupar registros por USERID
      const registrosPorUsuario = {};
      logs.forEach(log => {
        if (!registrosPorUsuario[log.userid]) {
          registrosPorUsuario[log.userid] = [];
        }
        registrosPorUsuario[log.userid].push({
          fecha: log.fecha,
          hora: log.hora,
          logTime: log.logTime
        });
      });

      console.log('Registros agrupados por usuario:', registrosPorUsuario);

      // Procesar cada grupo de registros
      for (const [userid, registros] of Object.entries(registrosPorUsuario)) {
        
        
        // Ordenar registros por hora
        registros.sort((a, b) => {
          const horaA = moment(a.hora, 'HH:mm:ss');
          const horaB = moment(b.hora, 'HH:mm:ss');
          return horaA - horaB;
        });
        
        // Obtener operador asociado al ID del reloj
        const operadores = await this.obtenerOperadoresPorIdReloj(userid);
       // console.log(`Operadores encontrados para userid ${userid}:`, operadores);
        
        if (!operadores.length) {
         // console.log(`No se encontró operador para el ID de reloj: ${userid}`);
          continue;
        }

        if (!operadores.length) {
          // Caso: operador ausente
          console.log(`No se encontró operador para USERID ${userid}. Se marca ausencia.`);
          const pool = await getConnection();

          // Registrar en HistorialAusencias
          await pool.request()
            .input('operadorId', sql.VarChar, userid)
            .input('fecha', sql.Date, fecha)
            .query(`
              INSERT INTO HistorialAusencias (operadorId, fecha, justificado, createdAt)
              VALUES (@operadorId, @fecha, 0, GETDATE())
            `);
          console.log(`Historial de ausencias insertado para operador ${userid} en fecha ${fecha}`);

          // Actualizar HorasTrabajadas: extraer horasExtra actual y sumar la penalización
          const penaltyHoras = this.HORAS_POR_CONDICION['Contratado'] || 6;  // Se asume 'Contratado' si no hay datos
          const resHoras = await pool.request()
            .input('operadorId', sql.VarChar, userid)
            .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
          let horasExtraActuales = resHoras.recordset[0] ? (resHoras.recordset[0].horasExtra || 0) : 0;
          const nuevasHorasExtra = horasExtraActuales + penaltyHoras;
          await pool.request()
            .input('operadorId', sql.VarChar, userid)
            .input('horasExtra', sql.Float, nuevasHorasExtra)
            .query(`
              UPDATE HorasTrabajadas
              SET horasExtra = @horasExtra, updatedAt = GETDATE()
              WHERE operadorId = @operadorId
            `);
          console.log(`Para operador ausente ${userid}, se actualizó horasExtra a: ${nuevasHorasExtra}`);
          continue; // Pasar al siguiente grupo de registros
        }



        // Calcular horas trabajadas
        let horasTotales = 0;
            for (let i = 0; i < registros.length - 1; i += 2) {
                const entrada = moment(registros[i].hora, 'HH:mm:ss');
                const salida = registros[i + 1] ? moment(registros[i + 1].hora, 'HH:mm:ss') : null;
                
                if (salida) {
                    const diferencia = salida.diff(entrada, 'hours', true);
                    horasTotales += diferencia;
                    console.log(`Horas calculadas entre ${entrada.format('HH:mm:ss')} y ${salida.format('HH:mm:ss')}: ${diferencia}`);
                }
            }

            // Redondear las horas trabajadas a 2 decimales
            horasTotales = Math.round(horasTotales * 100) / 100;
            console.log(`Total de horas trabajadas (decimal) para usuario ${userid}: ${horasTotales}`);

            // Para cada operador encontrado con ese ID de reloj
            for (const operador of operadores) {
                const { operadorId, condicionLaboral } = operador;
                console.log(`Registrando ${horasTotales} horas para operador ${operadorId} con condición ${condicionLaboral}`);

                // Registrar las horas trabajadas en formato decimal
                await horasService.registrarHorasTrabajadas(
                    operadorId,
                    registros[0].hora, // Primer registro como hora de entrada
                    horasTotales,
                    condicionLaboral
                );
            }
        }

        console.log("Sincronización completada exitosamente");
        return { success: true, mensaje: 'Sincronización completada' };
    } catch (error) {
        console.error("Error sincronizando registros diarios:", error);
        throw error;
    }
}

}

module.exports = new SincronizacionService();
