const ADODB = require('node-adodb');
const { ACCESS_DB_PATH } = require('../config/config');

class AccessDBService {
  constructor() {
    this.connection = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_DB_PATH};Persist Security Info=False;`);
  }

  async obtenerRegistrosDelDia(fecha) {
    try {
      const query = `
        SELECT 
          IdReloj,
          Format(Fecha, 'yyyy-mm-dd') as Fecha,
          Format(HoraEntrada, 'hh:nn:ss') as HoraEntrada,
          Format(HoraSalida, 'hh:nn:ss') as HoraSalida
        FROM RegistrosReloj
        WHERE Format(Fecha, 'yyyy-mm-dd') = '${fecha}'
      `;

      const registros = await this.connection.query(query);
      return registros;
    } catch (error) {
      console.error('Error al obtener registros de Access:', error);
      throw error;
    }
  }
}

module.exports = new AccessDBService(); 