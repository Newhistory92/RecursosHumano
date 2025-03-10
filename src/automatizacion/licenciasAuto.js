const schedule = require('node-schedule');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const ConfigService = require('../config/serverLicencia');
const sql = require('mssql');

class ActualizacionService {
 

  async actualizacionOctubre() {
    const pool = await getConnection();
    const anioActual = new Date().getFullYear();
    
    try {
      console.log("🔹 Iniciando actualización de octubre para el año:", anioActual);
      
      // 1. Obtener la lista de operadores que tienen registro en Personal
      const operadores = await pool.request().query(QUERIES.getOperadores);
      console.log(`🔹 Operadores encontrados: ${operadores.recordset.length}`);
      
      // 2. Procesar cada operador
      for (const operador of operadores.recordset) {
        console.log(`🔹 Procesando operador: ${operador.id}`);
        
        // Obtener datos del personal
        const personalDataResult = await pool.request()
          .input('operadorId', sql.NVarChar(1000), operador.id)
          .query(QUERIES.getPersonalInfo);
        
        if (personalDataResult.recordset.length > 0) {
          const personalData = personalDataResult.recordset[0];
          // Se asume que la consulta getPersonalInfo trae al menos:
          // fechaInicioPlanta, condicionLaboral y fechaInicioTrabj
          const { condicionLaboral, fechaInicioTrabj, fechaInicioPlanta } = personalData;
          console.log(`   • Datos personales: condicionLaboral: ${condicionLaboral}, fechaInicioTrabj: ${fechaInicioTrabj}, fechaInicioPlanta: ${fechaInicioPlanta}`);
          
          // 3. Calcular nuevos días de licencia para el año actual
          const nuevosDias = await ConfigService.calcularDiasSegunAntiguedad(
            fechaInicioPlanta,
            condicionLaboral,
            fechaInicioTrabj,
            operador.id
          );
          console.log(`   • Nuevos días de licencia calculados: ${nuevosDias}`);
          
          // 4. Actualizar la tabla Personal: asignar los nuevos días de licencia
          console.log("   • Actualizando Personal con los nuevos días asignados...");
          await pool.request()
            .input('operadorId', sql.NVarChar(1000), operador.id)
            .input('diasLicenciaAsignados', sql.Int, nuevosDias)
            .query(`
              UPDATE Personal
              SET diasLicenciaAsignados = @diasLicenciaAsignados,
                  updatedAt = GETDATE()
              WHERE operadorId = @operadorId
            `);
          console.log(`   • Personal actualizado para operador ${operador.id}`);
          
           // 5. Insertar en UsoLicencias (solo si no existe ya para este operador, tipo 'Licencia' y el año actual)
        console.log("   • Insertando registro en UsoLicencias (si no existe)...");
        await pool.request()
          .input('operadorId', sql.NVarChar(1000), operador.id)
          .input('anio', sql.Int, anioActual)
          .query(`
            IF NOT EXISTS (
              SELECT 1 FROM UsoLicencias 
              WHERE operadorId = @operadorId AND tipo = 'Licencia' AND anio = @anio
            )
            BEGIN
              INSERT INTO UsoLicencias (operadorId, tipo, anio, totalUsado, updatedAt)
              VALUES (@operadorId, 'Licencia', @anio, 0, GETDATE());
            END
          `);
        console.log(`   • Registro insertado (o ya existente) en UsoLicencias para operador ${operador.id}`);
      } else {
        console.log(`   ⚠️ No se encontraron datos de personal para operador ${operador.id}`);
      }
    }
      
      console.log('🎉 Actualización de octubre completada:', new Date());
    } catch (error) {
      console.error('❌ Error en actualización de octubre:', error);
      throw error;
    }
  }
  
  async actualizarEstadosLicencias() {
    try {
      const pool = await getConnection();
      // Se obtiene la fecha actual en formato YYYY-MM-DD
      const fechaActual = new Date().toISOString().split('T')[0];
      console.log(`🔹 Fecha actual: ${fechaActual}`);
  
      // Obtener las últimas 8 licencias activas
      const result = await pool.request()
        .query(QUERIES.getLicenciasActivas);
      console.log(`🔹 Licencias activas encontradas: ${result.recordset.length}`);
  
      for (const licencia of result.recordset) {
        // Convertir fechaInicio y fechaFin al formato YYYY-MM-DD
        const fechaInicio = new Date(licencia.fechaInicio).toISOString().split('T')[0];
        const fechaFin = licencia.fechaFin ? new Date(licencia.fechaFin).toISOString().split('T')[0] : null;
        
        console.log(`🔹 Procesando licencia de operador ${licencia.operadorId}:`);
        console.log(`    • fechaInicio: ${fechaInicio}`);
        console.log(`    • fechaFin: ${fechaFin || 'No especificada'}`);
  
        // Si la fecha actual coincide con la fecha de inicio, actualizar el tipo en Personal
        if (fechaInicio === fechaActual) {
          console.log(`🟢 La fecha de inicio coincide con la fecha actual.`);
          await pool.request()
            .input('operadorId', sql.VarChar, licencia.operadorId)
            .input('tipo', sql.VarChar, licencia.tipo)
            .query(QUERIES.actualizarTipoPersonal);
          console.log(`✅ Actualizado operador ${licencia.operadorId} a tipo ${licencia.tipo}`);
        }   // Manejo especial para licencias de un solo día
        if (fechaInicio === fechaFin) {
            console.log(`🕒 La licencia de ${licencia.operadorId} dura solo 1 día. Reactivando en 24 horas...`);
            setTimeout(async () => {
                try {
                    await pool.request()
                        .input('operadorId', sql.VarChar, licencia.operadorId)
                        .query(QUERIES.reactivarPersonal);
                    console.log(`✅ Reactivado operador ${licencia.operadorId} después de 24 horas`);
                } catch (error) {
                    console.error(`❌ Error al reactivar operador ${licencia.operadorId}:`, error);
                }
            }, 24 * 60 * 60 * 1000); // 24 horas en milisegundos
        }
        // Si la fecha actual coincide con la fecha de fin (y no es un solo día), reactivar inmediatamente
        else if (fechaFin === fechaActual) {
            await pool.request()
                .input('operadorId', sql.VarChar, licencia.operadorId)
                .query(QUERIES.reactivarPersonal);

            console.log(`✅ Reactivado operador ${licencia.operadorId}`);
        }
    }
      console.log('🎉 Actualización diaria de estados de licencias completada');
    } catch (error) {
      console.error('❌ Error en actualización diaria de estados:', error);
    }
  }
  

  iniciarActualizacionAutomatica() {

    // Actualización especial el 1 de octubre
    schedule.scheduleJob(
      { hour: 0, minute: 0, dayOfMonth: 1, month: 10, tz: 'America/Argentina/Buenos_Aires' }, 
      async () => {
      console.log('Iniciando actualización de octubre');
      try {
        await this.actualizacionOctubre();
      } catch (error) {
        console.error('Error en la actualización de octubre:', error);
      }
    });
    // Modo de prueba: ejecutar la actualización cada 1 minuto
    // schedule.scheduleJob('*/1 * * * *', async () => {
    //   console.log('Iniciando actualización cada 1 minuto de estados de licencias (modo prueba)');
    //   await this.actualizacionOctubre();
    // });
  }

  iniciarActualizacionDiaria() {
    //Original: ejecutar todos los días a las 00:00
    schedule.scheduleJob(
      { hour: 0, minute: 0, tz: 'America/Argentina/Buenos_Aires' },
      async () => {
        console.log('Iniciando actualización diaria de estados de licencias');
        await this.actualizarEstadosLicencias();
      }
    );
  
    // // Modo de prueba: ejecutar la actualización cada 1 minuto
    // schedule.scheduleJob('*/1 * * * *', async () => {
    //   console.log('Iniciando actualización cada 1 minuto de estados de licencias (modo prueba)');
    //   await this.actualizarEstadosLicencias();
    // });
  }
  
}

module.exports = new ActualizacionService();