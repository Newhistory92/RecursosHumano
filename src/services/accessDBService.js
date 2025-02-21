const ADODB = require('node-adodb'); 
const { ATT2000_DB_PATH } = require('../config/paths');

class AccessDBService {
  constructor() {
    this.connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${ATT2000_DB_PATH};`);
  }

  async getSystemLogsPorDia(fecha) {
    try {
      const query = `
        SELECT 
          ID,
          Format(LogTime, 'dd/mm/yyyy hh:nn:ss') as LogTime
        FROM SystemLog
        WHERE Format(LogTime, 'dd/mm/yyyy') = '${fecha}'
        ORDER BY LogTime ASC
      `;

      const logs = await this.connection.query(query);
      console.log(`Registros de SystemLog para la fecha ${fecha}:`, logs.length);

      return logs.map(log => ({
        id: log.ID,
        // Si LogTime es null, se mantiene null; si tiene dato, se transforma a ISO
        logTime: log.LogTime ? new Date(log.LogTime).toISOString() : null,
        logTimeOriginal: log.LogTime
      }));

    } catch (error) {
      console.error('Error al obtener registros de SystemLog por día:', error);
      throw new Error(`Error accediendo a SystemLog en ATT2000: ${error.message}`);
    }
  }
}

module.exports = new AccessDBService();
