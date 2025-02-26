const schedule = require('node-schedule');
const moment = require('moment');
const { getConnection } = require('../config/configbd');
const sql = require('mssql');

async function reiniciarHorasExtraComisionado() {
  console.log("Iniciando reinicio mensual de horasExtra para Comisionados:", new Date().toISOString());
  try {
    const pool = await getConnection();

    // 1. Extraer todos los operadores que sean "Comisionado" desde la tabla Personal.
    const queryOperadores = `
      SELECT operadorId
      FROM Personal
      WHERE condicionLaboral = 'Comisionado'
    `;
    const resOperadores = await pool.request().query(queryOperadores);
    const operadores = resOperadores.recordset;
    console.log(`Operadores con condición Comisionado encontrados: ${operadores.length}`);

    // Definir el primer día del mes actual (en formato YYYY-MM-DD)
    const primerDiaMes = moment().startOf('month').format('YYYY-MM-DD');
    console.log(`Primer día del mes: ${primerDiaMes}`);

    // Procesar cada operador
    for (const op of operadores) {
      const operadorId = op.operadorId;
      console.log(`Procesando operador ${operadorId}`);

      // 2. Obtener horasExtra actual de la tabla HorasTrabajadas para este operador
      const resHoras = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
      let horasExtraActuales = resHoras.recordset[0] ? (resHoras.recordset[0].horasExtra || 0) : 0;
      console.log(`Operador ${operadorId} - horasExtra actuales: ${horasExtraActuales}`);

      // 3. Consultar RegistroHorasDiarias para el primer día del mes
      const resRegistro = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('fecha', sql.Date, primerDiaMes)
        .query(`
          SELECT horas 
          FROM RegistroHorasDiarias 
          WHERE operadorId = @operadorId AND CONVERT(date, fecha) = @fecha
        `);

      if (resRegistro.recordset.length > 0) {
        const registroHoras = resRegistro.recordset[0].horas;
        console.log(`Operador ${operadorId} - RegistroHorasDiarias existente en ${primerDiaMes}: ${registroHoras}`);
        // Si no coincide, se actualiza
        if (registroHoras !== horasExtraActuales) {
          await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .input('fecha', sql.Date, primerDiaMes)
            .input('horas', sql.Float, horasExtraActuales)
            .query(`
              UPDATE RegistroHorasDiarias 
              SET horas = @horas, updatedAt = GETDATE() 
              WHERE operadorId = @operadorId AND CONVERT(date, fecha) = @fecha
            `);
          console.log(`Operador ${operadorId} - RegistroHorasDiarias actualizado a ${horasExtraActuales} horas.`);
        } else {
          console.log(`Operador ${operadorId} - RegistroHorasDiarias ya coincide con horasExtra.`);
        }
      } else {
        // Si no existe, se inserta un nuevo registro
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('fecha', sql.Date, primerDiaMes)
          .input('horas', sql.Float, horasExtraActuales)
          .query(`
            INSERT INTO RegistroHorasDiarias (operadorId, fecha, horas, createdAt)
            VALUES (@operadorId, @fecha, @horas, GETDATE())
          `);
        console.log(`Operador ${operadorId} - Nuevo RegistroHorasDiarias insertado con ${horasExtraActuales} horas.`);
      }

      // 4. Reiniciar horasExtra en HorasTrabajadas a 0
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          UPDATE HorasTrabajadas
          SET horasExtra = 0, updatedAt = GETDATE()
          WHERE operadorId = @operadorId
        `);
      console.log(`Operador ${operadorId} - horasExtra reiniciadas a 0.`);
    }
    console.log("Reinicio mensual de horasExtra para Comisionados completado.");
  } catch (error) {
    console.error("Error en reiniciarHorasExtraComisionado:", error);
  }
}




module.exports =  reiniciarHorasExtraComisionado ;
