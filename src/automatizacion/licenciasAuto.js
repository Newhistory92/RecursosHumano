const schedule = require('node-schedule');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { TIPOS_LICENCIA, ACTUALIZACION_DIARIA, ACTUALIZACION_OCTUBRE } = require('../utils/type');
const licenciasService = require('../licenciasService/licenciasService');
const ConfigService = require('../config/serverLicencia');

class ActualizacionService {
  async actualizacionDiaria() {
    const pool = await getConnection();
    const anioActual = new Date().getFullYear();
    
    try {
      const operadores = await pool.request().query(QUERIES.getOperadores);

      for (const operador of operadores.recordset) {
        for (const tipo of TIPOS_LICENCIA) {
          await licenciasService.actualizarUsoLicencias(operador.id, tipo, anioActual);
        }
      }

      console.log('Actualización diaria completada:', new Date());
    } catch (error) {
      console.error('Error en actualización diaria:', error);
      throw error;
    }
  }

  async actualizacionOctubre() {
    const pool = await getConnection();
    const anioActual = new Date().getFullYear();
    
    try {
      const operadores = await pool.request().query(QUERIES.getOperadores);

      for (const operador of operadores.recordset) {
        // Obtener datos del personal
        const personalData = await pool.request()
          .input('operadorId', operador.id)
          .query(QUERIES.getPersonalInfo);

        if (personalData.recordset.length > 0) {
          const { condicionLaboral, fechaInicioTrabj } = personalData.recordset[0];
          
          // Calcular nuevos días de licencia para el año actual
          const nuevosDias = await ConfigService.calcularDiasSegunAntiguedad(
            fechaInicioTrabj,
            condicionLaboral,
            operador.id
          );

          // Actualizar días asignados en Personal y reiniciar contador en UsoLicencias
          await pool.request()
            .input('operadorId', operador.id)
            .input('diasLicenciaAsignados', nuevosDias)
            .input('anio', anioActual)
            .query(`
              -- Actualizar días asignados en Personal
              UPDATE Personal
              SET diasLicenciaAsignados = @diasLicenciaAsignados,
                  updatedAt = GETDATE()
              WHERE operadorId = @operadorId;

              -- Reiniciar contador en UsoLicencias para el nuevo período
              MERGE INTO UsoLicencias AS target
              USING (VALUES (@operadorId, 'Licencia', @anio)) 
                AS source (operadorId, tipo, anio)
              ON target.operadorId = source.operadorId 
                AND target.tipo = source.tipo 
                AND target.anio = source.anio
              WHEN MATCHED THEN
                UPDATE SET 
                  totalUsado = (
                    SELECT COALESCE(SUM(cantidad), 0)
                    FROM Licencias
                    WHERE operadorId = @operadorId
                    AND tipo = 'Licencia'
                    AND anio = @anio
                    AND estado = 'APROBADA'
                    AND fechaInicio >= DATEFROMPARTS(@anio, 10, 1)
                  ),
                  updatedAt = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (operadorId, tipo, anio, totalUsado, updatedAt)
                VALUES (
                  source.operadorId, 
                  source.tipo, 
                  source.anio,
                  0,
                  GETDATE()
                );
            `);
        }
      }

      console.log('Actualización de octubre completada:', new Date());
    } catch (error) {
      console.error('Error en actualización de octubre:', error);
      throw error;
    }
  }

  iniciarActualizacionAutomatica() {
    // Actualización diaria a medianoche
    schedule.scheduleJob(ACTUALIZACION_DIARIA, async () => {
      console.log('Iniciando actualización diaria de licencias');
      try {
        await this.actualizacionDiaria();
      } catch (error) {
        console.error('Error en la actualización diaria:', error);
      }
    });

    // Actualización especial el 1 de octubre
    schedule.scheduleJob(ACTUALIZACION_OCTUBRE, async () => {
      console.log('Iniciando actualización de octubre');
      try {
        await this.actualizacionOctubre();
      } catch (error) {
        console.error('Error en la actualización de octubre:', error);
      }
    });
  }
}

module.exports = new ActualizacionService();