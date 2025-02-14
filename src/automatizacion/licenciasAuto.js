const schedule = require('node-schedule');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { TIPOS_LICENCIA, ACTUALIZACION_SCHEDULE } = require('../utils/type');
const licenciasService = require('../licenciasService/licenciasService');
const ConfigService =  require('../config/serverLicencia');

class ActualizacionService {
  async actualizacionAutomatica() {
    const pool = await getConnection();
    const anioActual = new Date().getFullYear();
    
    try {
      const operadores = await pool.request().query(QUERIES.getOperadores);

      // for (const operador of operadores.recordset) {
      //   await ConfigService.calcularDiasSegunAntiguedad(operador.id);

        for (const tipo of TIPOS_LICENCIA) {
          await licenciasService.actualizarUsoLicencias(operador.id, tipo, anioActual);
        }
      

      console.log('Actualización automática completada:', new Date());
    } catch (error) {
      console.error('Error en actualización automática:', error);
      throw error;
    }
  }

  iniciarActualizacionAutomatica() {
    schedule.scheduleJob(ACTUALIZACION_SCHEDULE, async () => {
      console.log('Iniciando actualización automática de licencias');
      try {
        await this.actualizacionAutomatica();
      } catch (error) {
        console.error('Error en la actualización programada:', error);
      }
    });
  }
}

module.exports = new ActualizacionService();