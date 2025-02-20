const schedule = require('node-schedule');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { TIPOS_LICENCIA, ACTUALIZACION_DIARIA, ACTUALIZACION_OCTUBRE } = require('../utils/type');
const licenciasService = require('../licenciasService/licenciasService');
const ConfigService = require('../config/serverLicencia');
const sql = require('mssql');

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
                    AND estado = 'Aprobada'
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

  async actualizarEstadosLicencias() {
    try {
      const pool = await getConnection();
      const fechaActual = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

      // Obtener las últimas 8 licencias
      const result = await pool.request()
        .query(QUERIES.getLicenciasActivas);

      for (const licencia of result.recordset) {
        const fechaInicio = new Date(licencia.fechaInicio).toISOString().split('T')[0];
        const fechaFin = licencia.fechaFin ? new Date(licencia.fechaFin).toISOString().split('T')[0] : null;

        // Si la fecha actual coincide con la fecha de inicio, actualizar tipo
        if (fechaInicio === fechaActual) {
          await pool.request()
            .input('operadorId', sql.VarChar, licencia.operadorId)
            .input('tipo', sql.VarChar, licencia.tipo)
            .query(QUERIES.actualizarTipoPersonal);

          console.log(`Actualizado operador ${licencia.operadorId} a tipo ${licencia.tipo}`);
        }

        // Si la fecha actual coincide con la fecha de fin, reactivar personal
        if (fechaFin === fechaActual) {
          await pool.request()
            .input('operadorId', sql.VarChar, licencia.operadorId)
            .query(QUERIES.reactivarPersonal);

          console.log(`Reactivado operador ${licencia.operadorId}`);
        }
      }

      console.log('Actualización diaria de estados de licencias completada');
    } catch (error) {
      console.error('Error en actualización diaria de estados:', error);
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

  iniciarActualizacionDiaria() {
    // Ejecutar todos los días a las 00:00
    schedule.scheduleJob(ACTUALIZACION_DIARIA, async () => {
      console.log('Iniciando actualización diaria de estados de licencias');
      await this.actualizarEstadosLicencias();
    });
  }
}

module.exports = new ActualizacionService();