const moment = require('moment');
const accessDBService = require('./accessDBService');
const horasService = require('./horasService');
const sql = require('mssql');
const { getConnection } = require('../config/configbd'); 
const { HORAS_POR_CONDICION } = require('../utils/type');

// class SincronizacionService {
  
//   async obtenerTodosLosOperadores() {
//     try {
//       const pool = await getConnection();
//       const result = await pool.request()
//         .query(`SELECT operadorId, idReloj, condicionLaboral FROM Personal`);
//       return result.recordset;
//     } catch (error) {
//       console.error('Error obteniendo operadores:', error);
//       throw error;
//     }
//   }

//   async sincronizarRegistrosDiarios(fecha) {
//     let pool;
//     try {
//       pool = await getConnection();
//       const fechaSync = new Date(fecha);
//       const currentYear = fechaSync.getFullYear();

//       // 1. Obtener registros desde Access
//       const logs = await accessDBService.getSystemLogsPorDia(fecha);
      
//       if (!logs || logs.length === 0) {
//         console.log("No hay registros para sincronizar.");
//         return { success: false, mensaje: 'No hay registros para sincronizar' };
//       }

//       // 2. Agrupar registros por USERID (compatible con SQL 2014)
//       const registrosPorUsuario = {};
//       logs.forEach(log => {
//         if (!registrosPorUsuario[log.userid]) {
//           registrosPorUsuario[log.userid] = [];
//         }
//         registrosPorUsuario[log.userid].push({
//           fecha: log.fecha,
//           hora: log.hora,
//           logTime: log.logTime
//         });
//       });

//       // 3. Obtener todos los operadores (versión compatible)
//       const operadores = await this.obtenerTodosLosOperadores();
//       const operadoresDict = {};
//       operadores.forEach(op => {
//         operadoresDict[op.idReloj] = op;
//       });

//       // 4. Procesar ausentes (compatible con SQL 2014)
//       const idsPresentes = Object.keys(registrosPorUsuario);
//       for (const operador of operadores) {
//         if (idsPresentes.indexOf(operador.idReloj.toString()) === -1) {
//           const { operadorId, condicionLaboral } = operador;
          
//           // Verificar licencia (sintaxis compatible)
//           const licenciaResult = await pool.request()
//             .input('operadorId', sql.VarChar(50), operadorId)
//             .input('fecha', sql.Date, fechaSync)
//             .input('currentYear', sql.Int, currentYear)
//             .query(`
//               SELECT COUNT(1) AS tieneLicencia
//               FROM Licencias
//               WHERE operadorId = @operadorId
//                 AND fechaInicio <= @fecha
//                 AND fechaFin >= @fecha
//                 AND estado = 'Aprobado'
//                 AND anio = @currentYear
//             `);

//           if (licenciaResult.recordset[0].tieneLicencia > 0) {
//             console.log(`Operador ${operadorId} tiene licencia. Registrando 0 horas.`);
//             await horasService.registrarHorasTrabajadas(
//               operadorId, 
//               '00:00:00', 
//               0, 
//               condicionLaboral
//             );
//           } else {
//             // Registrar ausencia
//             await pool.request()
//               .input('operadorId', sql.VarChar(50), operadorId)
//               .input('fecha', sql.Date, fecha)
//               .execute('sp_RegistrarAusencia'); // Usar stored procedure recomendado

//             // Aplicar penalización (sintaxis compatible)
//             const penaltyHoras = HORAS_POR_CONDICION[condicionLaboral] || 6;
//             await pool.request()
//               .input('operadorId', sql.VarChar(50), operadorId)
//               .input('penaltyHoras', sql.Decimal(10,2), penaltyHoras)
//               .query(`
//                 UPDATE HorasTrabajadas
//                 SET horasExtra = COALESCE(horasExtra, 0) + @penaltyHoras
//                 WHERE operadorId = @operadorId
//               `);
//           }
//         }
//       }

//       // 5. Procesar presentes (versión compatible)
//       for (const userid in registrosPorUsuario) {
//         if (registrosPorUsuario.hasOwnProperty(userid)) {
//           const operador = operadoresDict[userid];
//           if (!operador) {
//             console.log(`Operador no encontrado para userid ${userid}`);
//             continue;
//           }

//           const registros = registrosPorUsuario[userid];
          
//           // Ordenar registros (compatible)
//           registros.sort((a, b) => {
//             return moment(a.hora, 'HH:mm:ss').valueOf() - moment(b.hora, 'HH:mm:ss').valueOf();
//           });

//           // Calcular horas (método compatible)
//           let horasTotales = 0;
//           for (let i = 0; i < registros.length; i += 2) {
//             if (i + 1 < registros.length) {
//               const entrada = moment(registros[i].hora, 'HH:mm:ss');
//               const salida = moment(registros[i+1].hora, 'HH:mm:ss');
//               horasTotales += salida.diff(entrada, 'hours', true);
//             }
//           }

//           horasTotales = Math.round(horasTotales * 100) / 100;
          
//           await horasService.registrarHorasTrabajadas(
//             operador.operadorId,
//             registros[0].hora,
//             horasTotales,
//             operador.condicionLaboral
//           );
//         }
//       }

//       console.log("Sincronización completada exitosamente");
//       return { success: true, mensaje: 'Sincronización completada' };
//     } catch (error) {
//       console.error("Error en sincronización:", error);
//       throw error;
//     } finally {
//       if (pool) {
//         await pool.close();
//       }
//     }
//   }
// }

// module.exports = new SincronizacionService();


class SincronizacionService {
  async obtenerTodosLosOperadores() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(
        `SELECT operadorId, idReloj, condicionLaboral FROM Personal`
      );
      return result.recordset;
    } catch (error) {
      console.error(`Error obteniendo operadores:`, error);
      throw error;
    }
  }

  async sincronizarRegistrosDiarios(fecha) {
    try {
      const fechaSync = new Date(fecha);
      const currentYear = fechaSync.getFullYear();
      const logs = await accessDBService.getSystemLogsPorDia(fecha);//acepta solo fecha en formato YYYY-MM-DD

      if (!logs.length) {
        console.log("No hay registros para sincronizar.");
        return;
      }

      const registrosPorUsuario = logs.reduce((acc, log) => {
        const userid = String(log.userid);
        if (!acc[userid]) acc[userid] = [];
        acc[userid].push({ fecha: log.fecha, hora: log.hora, logTime: log.logTime });
        return acc;
      }, {});

      const operadores = await this.obtenerTodosLosOperadores();
      console.log("Total de operadores:", operadores.length);
      const operadoresMap = new Map(operadores.map(op => [String(op.idReloj), op]));
      const ausentes = new Set(operadores.map(op => String(op.idReloj)));
      console.log("Iniciando procesamiento de PRESENTES");
      for (const [userid, registros] of Object.entries(registrosPorUsuario)) {
        registros.sort((a, b) => moment(a.hora, 'HH:mm:ss') - moment(b.hora, 'HH:mm:ss'));

        if (!operadoresMap.has(userid)) continue;
        
        ausentes.delete(userid);


        ausentes.delete(userid);

        let horasTotales = 0;
        for (let i = 0; i < registros.length - 1; i += 2) {
          const entrada = moment(registros[i].hora, 'HH:mm:ss');
          const salida = registros[i + 1] ? moment(registros[i + 1].hora, 'HH:mm:ss') : null;
          if (salida) horasTotales += salida.diff(entrada, 'hours', true);
          
        }
        horasTotales = Math.round(horasTotales * 100) / 100;

        const { operadorId, condicionLaboral } = operadoresMap.get(userid);
        if (condicionLaboral === "Comisionado") {
          // 👇  flujo exclusivo para comisionados
          const pool = await getConnection();
          const resHoras = await pool.request()
              .input('operadorId', sql.VarChar, operadorId)
              .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
  
          const horasExtraActuales = resHoras.recordset[0]?.horasExtra || 0;
          const nuevasHorasExtra = horasExtraActuales + horasTotales;
  
          await pool.request()
              .input('operadorId', sql.VarChar, operadorId)
              .input('horasExtra', sql.Float, nuevasHorasExtra)
              .query(`UPDATE HorasTrabajadas SET horasExtra = @horasExtra, updatedAt = GETDATE() WHERE operadorId = @operadorId`);
  
      } else {
        await horasService.registrarHorasTrabajadas(operadorId, registros[0].hora, horasTotales, condicionLaboral);
      }
    }
      console.log("Iniciando procesamiento de AUSENTES");

      const pool = await getConnection();
      for (const idReloj of ausentes) {
        const { operadorId, condicionLaboral } = operadoresMap.get(idReloj);
        console.log(`Procesando operador ausente: ${operadorId}  idReloj: ${idReloj}`);
        const resultLic = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('fecha', sql.Date, fechaSync)
          .input('currentYear', sql.Int, currentYear)
          .query(`
            SELECT COUNT(*) AS cantidad
            FROM Licencias
            WHERE operadorId = @operadorId
              AND fechaInicio <= @fecha
              AND fechaFin >= @fecha
              AND estado = 'Aprobado'
              AND anio = @currentYear
          `);

        if (resultLic.recordset[0].cantidad === 0) {
          console.log(`Operador ${operadorId} ausente SIN licencia`);
          await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .input('fecha', sql.Date, fecha)
            .query(`INSERT INTO HistorialAusencias (operadorId, fecha, justificado, updatedAt) VALUES (@operadorId, @fecha, 0, GETDATE())`);

            if (condicionLaboral !== "Comisionado") {
              const penaltyHoras = HORAS_POR_CONDICION[condicionLaboral];
              const resHoras = await pool.request()
                .input('operadorId', sql.VarChar, operadorId)
                .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
              
              const horasExtraActuales = resHoras.recordset[0]?.horasExtra || 0;
              const nuevasHorasExtra = horasExtraActuales + penaltyHoras;
              
              await pool.request()
                .input('operadorId', sql.VarChar, operadorId)
                .input('horasExtra', sql.Float, nuevasHorasExtra)
                .query(`UPDATE HorasTrabajadas SET horasExtra = @horasExtra, updatedAt = GETDATE() WHERE operadorId = @operadorId`);
            }
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