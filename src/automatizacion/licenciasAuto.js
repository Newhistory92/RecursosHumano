const schedule = require('node-schedule');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const ConfigService = require('../config/serverLicencia');
const dataService = require('../licenciasService/dataService');
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
        const personalDataResult = await dataService.loadPersonalData(operador.id);
        if (personalDataResult && Object.keys(personalDataResult).length > 0) {
          console.log("   • Datos personales encontrados:", personalDataResult);
          // Se asume que la consulta getPersonalInfo trae al menos:
          // fechaInicioPlanta, condicionLaboral y fechaInicioTrabj
          const { condicionLaboral, fechaInicioTrabj, fechaInicioPlanta,id } = personalDataResult;
          console.log(`   • Datos personales: condicionLaboral: ${condicionLaboral}, fechaInicioTrabj: ${fechaInicioTrabj}, fechaInicioPlanta: ${fechaInicioPlanta}`);
          
          // 3. Calcular nuevos días de licencia para el año actual
          const nuevosDias = await ConfigService.calcularDiasSegunAntiguedad(
            fechaInicioPlanta,
            condicionLaboral,
            fechaInicioTrabj,
            id,
            operador.id
          );
          console.log(`   • Nuevos días de licencia calculados: ${nuevosDias}`);

           // 4. Insertar en UsoLicencias (solo si no existe ya para este operador, tipo 'Licencia' y el año actual)
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
      // Obtener la fecha actual en formato local YYYY-MM-DD
      const fechaActual = new Date();
      const fechaActualStr = fechaActual.toLocaleDateString('en-CA');
      console.log(`🔹 Fecha actual: ${fechaActualStr}`);
  
      // Obtener las últimas 8 licencias activas
      const result = await pool.request().query(QUERIES.getLicenciasActivas);
      console.log(`🔹 Licencias activas encontradas: ${result.recordset.length}`);
  
      for (const licencia of result.recordset) {
        // Extraer fechaInicio y fechaFin en formato local
        const fechaInicioStr = new Date(licencia.fechaInicio).toLocaleDateString('en-CA');
        const fechaFinStr = licencia.fechaFin ? new Date(licencia.fechaFin).toLocaleDateString('en-CA') : null;
  
        console.log(`🔹 Procesando licencia de operador ${licencia.operadorId}:`);
        console.log(`    • fechaInicio: ${fechaInicioStr}`);
        console.log(`    • fechaFin: ${fechaFinStr || 'No especificada'}`);
  
        // Si la fecha de inicio coincide con la fecha actual, actualizar el tipo en Personal
        if (fechaInicioStr === fechaActualStr) {
          console.log(`🟢 La fecha de inicio (${fechaInicioStr}) coincide con la fecha actual.`);
          await pool.request()
            .input('operadorId', sql.VarChar, licencia.operadorId)
            .input('tipo', sql.VarChar, licencia.tipo)
            .query(QUERIES.actualizarTipoPersonal);
          console.log(`✅ Actualizado operador ${licencia.operadorId} a tipo ${licencia.tipo}`);
        }
  
        // Si la fecha de fin coincide con la fecha actual, reactivar inmediatamente
        if (fechaFinStr === fechaActualStr) {
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