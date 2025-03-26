const ADODB = require('node-adodb'); 
const { ATT2000_DB_PATH } = require('../config/paths');
const moment = require('moment');

class AccessDBService {
  constructor() {
    this.connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${ATT2000_DB_PATH};`);
  }

  async getSystemLogsPorDia(fecha) {
    try {
      console.log('Intentando obtener registros para la fecha:', fecha);
      
      const query = `
        SELECT DISTINCT
          USERID,
          CHECKTIME
        FROM CHECKINOUT
        WHERE CHECKTIME >= #${fecha} 00:00:00# 
        AND CHECKTIME <= #${fecha} 23:59:59#
        ORDER BY CHECKTIME ASC
      `;

   

      const logs = await this.connection.query(query);


      if (!logs || !logs.length) {
        console.log('No se encontraron registros para la fecha');
        return [];
      }

      // Eliminar duplicados exactos y formatear fechas
      const registrosUnicos = [];
      const horariosVistos = new Set();

      logs.forEach(log => {
        const checktime = moment(log.CHECKTIME);
        const horarioKey = checktime.format('HH:mm:ss'); // Clave única por horario

        if (!horariosVistos.has(horarioKey)) {
          horariosVistos.add(horarioKey);
          registrosUnicos.push({
            userid: log.USERID,
            fecha: checktime.format('DD/MM/YYYY'),
            hora: checktime.format('HH:mm:ss'),
            logTime: checktime.format('DD/MM/YYYY HH:mm:ss')
          });
        }
      });

      //console.log('Registros procesados sin duplicados:', registrosUnicos);
      //console.log(`Total de registros únicos encontrados: ${registrosUnicos.length}`);

      return registrosUnicos;

    } catch (error) {
      console.error('Error detallado al obtener registros:', error);
      console.error('Stack trace:', error.stack);
      throw new Error(`Error accediendo a CHECKINOUT en ATT2000: ${error.message}`);
    }
  }
}

module.exports = new AccessDBService();
