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
     
      const logs = await accessDBService.getSystemLogsPorDia();
      
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

      // Procesar cada grupo de registros
      for (const [userid, registros] of Object.entries(registrosPorUsuario)) {
        // Ordenar registros por hora
        registros.sort((a, b) => {
          const horaA = moment(a.hora, 'HH:mm:ss');
          const horaB = moment(b.hora, 'HH:mm:ss');
          return horaA - horaB;
        });
        
        const operadores = await this.obtenerOperadoresPorIdReloj(userid);
        
        if (!operadores.length) continue;

        // Calcular horas trabajadas
        let horasTotales = 0;
        for (let i = 0; i < registros.length - 1; i += 2) {
          const entrada = moment(registros[i].hora, 'HH:mm:ss');
          const salida = registros[i + 1] ? moment(registros[i + 1].hora, 'HH:mm:ss') : null;
          
          if (salida) {
            const diferencia = salida.diff(entrada, 'hours', true);
            horasTotales += diferencia;
          }
        }
             
        // Convertir horasTotales a formato HH:mm
        const horasRedondeadas = Math.floor(horasTotales);
        const minutos = Math.ceil((horasTotales - horasRedondeadas) * 60);
        const horasFinales = minutos === 60 ? horasRedondeadas + 1 : horasRedondeadas;
        const minutosFinales = minutos === 60 ? 0 : minutos;
        const horasTotalesFormateadas = `${String(horasFinales).padStart(2, '0')}:${String(minutosFinales).padStart(2, '0')}`;
        
        console.log(`Horas Totales Redondeadas: ${ horasTotalesFormateadas}`);
        // Registrar para cada operador
        for (const operador of operadores) {
          const { operadorId, condicionLaboral } = operador;
        
        
          await horasService.registrarHorasTrabajadas(
            operadorId,
            registros[0].hora,  // Primera hora de entrada
            horasTotalesFormateadas,
            condicionLaboral
          );
        }
      }

      return { success: true, mensaje: 'Sincronización completada' };
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
