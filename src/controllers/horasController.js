const sql = require("mssql");
const { getConnection } = require('../config/configbd');
const sincronizacionService = require('../services/sincronizacionService');
const schedule = require('node-schedule');
const { validarOperadorId } = require('../utils/validaciones');
const reiniciarHorasExtraComisionado = require('../services/reiniciohoraExtra');
const horasService = require('../services/horasService');
class HorasController {
  constructor() {
    // Bind de los métodos
    this.obtenerResumenHoras = this.obtenerResumenHoras.bind(this);
    this.sincronizarHoras = this.sincronizarHoras.bind(this);
    this.agregarAusencia = this.agregarAusencia.bind(this);
    this.eliminarAusencia = this.eliminarAusencia.bind(this);
    this.listarAusencias = this.listarAusencias.bind(this);
    this.getRegistroHorasDiarias = this.getRegistroHorasDiarias.bind(this);

     // Programar el job para el primer día del mes a las 00:00
     schedule.scheduleJob(
      { hour: 0, minute: 0, dayOfMonth: 1, tz: 'America/Argentina/Buenos_Aires' }, 
      reiniciarHorasExtraComisionado
    );
    // Programar sincronización cada minuto
    schedule.scheduleJob({ hour: 22, minute: 0, tz: 'America/Argentina/Buenos_Aires' }, async () => {
      try {
        // Fecha estática para pruebas
        await this.sincronizarHoras(); // Usar el mismo método para mantener consistencia
      } catch (error) {
        console.error('Error en sincronización automática:', error);
      }
    });
  }

  // Función para obtener resumen de horas trabajadas
  async obtenerResumenHoras(req, res) {
    try {
      const { operadorId } = req.params;
  
      if (!validarOperadorId(operadorId)) {
        return res.status(400).json({
          error: 'ID de operador inválido',
          mensaje: `El ID del operador '${operadorId}' no tiene un formato válido`
        });
      }
  
      const pool = await getConnection();
  
      // Query a HorasTrabajadas
      const queryHorasTrabajadas = `
        SELECT horasExtra, updatedAt
        FROM HorasTrabajadas
        WHERE operadorId = @operadorId
      `;
      const resultHoras = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(queryHorasTrabajadas);
  
      if (resultHoras.recordset.length === 0) {
        return res.status(404).json({
          error: 'No se encontraron registros de horas trabajadas para el operador'
        });
      }
  
      const { horasExtra, updatedAt } = resultHoras.recordset[0];
      const horasExtraFormato = this.convertirDecimalAHora(horasExtra);
  
      // Query a RegistroHorasDiarias
      const queryRegistroHoras = `
        SELECT id, fecha, horas
        FROM RegistroHorasDiarias
        WHERE operadorId = @operadorId
      `;
      const resultRegistroHoras = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(queryRegistroHoras);
      const registroHoras = resultRegistroHoras.recordset;
  
      // Query a HistorialAusencias para la fecha actual
      const fechaActual = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
      const queryHistorialAusencias = `
        SELECT fecha, justificado
        FROM HistorialAusencias
        WHERE operadorId = @operadorId
          AND CONVERT(date, fecha) = @fechaActual
      `;
      const resultAusencias = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('fechaActual', sql.Date, fechaActual)
        .query(queryHistorialAusencias);
      const ausencia = resultAusencias.recordset.length > 0 
        ? resultAusencias.recordset[0] 
        : {};
  
      res.json({
        horasExtra: horasExtraFormato,
        updatedAt,
        registroHoras,
        ausencia
      });
    } catch (error) {
      console.error('Error en obtenerResumenHoras:', error);
      res.status(500).json({
        error: 'Error obteniendo resumen de horas',
        mensaje: error.message
      });
    }
  }
  

  // Función para sincronizar horas con la fecha actual
  async sincronizarHoras(req, res) {
    try {
      const fechaActual = new Date().toISOString().split('T')[0];
     // const fecha = "22/04/2022"; // Fecha estática para pruebas
      const resultado = await sincronizacionService.sincronizarRegistrosDiarios(fechaActual);
      
      if (res) {
        res.json({
          mensaje: 'Sincronización completada',
          resultado
        });
      } else {
        console.log('Sincronización automática completada:', resultado);
      }
    } catch (error) {
      console.error('Error en sincronizarHoras:', error);
      if (res) {
        res.status(500).json({
          error: 'Error en sincronización',
          mensaje: error.message
        });
      }
    }
  }

  // Función para convertir decimal a formato HH:mm
  convertirDecimalAHora(decimal) {
    const horas = Math.floor(decimal);
    const minutos = Math.round((decimal - horas) * 60);
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  }


// Agregar ausencia: inserta en HistorialAusencias la fecha indicada con justificado = false

async agregarAusencia(req, res) {
  try {
      const { operadorId, fecha, condicionLaboral } = req.body;

      if (!operadorId || !fecha || !condicionLaboral) {
          return res.status(400).json({ error: 'Faltan parámetros: operadorId, fecha y condicionLaboral son requeridos' });
      }

      console.log(`Agregando ausencia para operador ${operadorId} en la fecha ${fecha}`);

      const pool = await getConnection();

      // Insertar ausencia (justificado = false por defecto)
      await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('fecha', sql.Date, fecha)
          .query(`
              INSERT INTO HistorialAusencias (operadorId, fecha, justificado, updatedAt)
              VALUES (@operadorId, @fecha, 0, GETDATE())
          `);

      console.log(`Ausencia insertada para operador ${operadorId} en la fecha ${fecha}`);
        
      // Actualizar Personal: establecer el campo "tipo" a "Ausente"
    await pool.request()
    .input('operadorId', sql.VarChar, operadorId)
    .input('tipo', sql.VarChar, "Ausente")
    .query(`
        UPDATE Personal 
        SET tipo = @tipo, updatedAt = GETDATE()
        WHERE operadorId = @operadorId
    `);
      // Obtener horasExtra actual desde HorasTrabajadas
      const resHoras = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);

      let horasExtraActuales = resHoras.recordset[0] ? (resHoras.recordset[0].horasExtra || 0) : 0;

      // Definir horas a sumar según la condición laboral
      const HORAS_POR_CONDICION = {
          'Contratado': 6,
          'Planta_Permanente': 7,
          'Comisionado': 0
      };

      const horasASumar = HORAS_POR_CONDICION[condicionLaboral] || 0;
      const nuevasHorasExtra = horasExtraActuales + horasASumar;

      // Actualizar HorasTrabajadas con las nuevas horas extra
      await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('horasExtra', sql.Int, nuevasHorasExtra)
          .query(`
              UPDATE HorasTrabajadas 
              SET horasExtra = @horasExtra 
              WHERE operadorId = @operadorId
          `);

      console.log(`Horas extra actualizadas a ${nuevasHorasExtra} para operador ${operadorId}`);

      res.status(200).json({ mensaje: 'Ausencia agregada y horas extra actualizadas correctamente' });

  } catch (error) {
      console.error('Error al agregar ausencia:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
  }
}


async justificarAusencia(req, res) {
  try {
    // Extraer ausenciaId desde los parámetros y justificado, condicionLaboral, fechaJustificada, operadorId desde el body
    const { ausenciaId } = req.params;
    const { justificado, condicionLaboral, fechaJustificada, operadorId } = req.body;

  
       await horasService.justificarAusencia(ausenciaId, justificado, condicionLaboral, fechaJustificada, operadorId);
   
    res.status(200).json({ mensaje: 'Ausencia actualizada y penalización de horas extra corregida' });
  } catch (error) {
    console.error('Error agendando licencia:', error);
    res.status(500).json({ error: 'Error interno del servidor', mensaje: error.message });
  }
}


async listarAusencias(req, res) {
  try {
      const { operadorId } = req.params;

      if (!operadorId) {
          return res.status(400).json({ error: 'El parámetro operadorId es requerido' });
      }

      console.log(`Obteniendo lista de ausencias para operador ${operadorId}`);

      const pool = await getConnection();

      const result = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .query(`
              SELECT id,fecha, justificado, createdAt
              FROM HistorialAusencias
              WHERE operadorId = @operadorId
              ORDER BY fecha DESC
          `);

      const ausencias = result.recordset;

      res.status(200).json({ operadorId, ausencias });

  } catch (error) {
      console.error('Error al listar ausencias:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
  }
}

  // Eliminar ausencia: elimina el registro de ausencia según operador y fecha
  async eliminarAusencia(req, res) {
    try {
        const { operadorId, fecha, condicionLaboral } = req.body;

        if (!operadorId || !fecha || !condicionLaboral) {
            return res.status(400).json({ error: 'Faltan parámetros: operadorId, fecha y condicionLaboral son requeridos' });
        }

        console.log(`Eliminando ausencia para operador ${operadorId} en la fecha ${fecha}`);

        const pool = await getConnection();

        // Definir horas a restar según la condición laboral
        const HORAS_POR_CONDICION = {
            'Contratado': 6,
            'Planta_Permanente': 7
        };
        const horasADescontar = HORAS_POR_CONDICION[condicionLaboral] || 0;

        // Obtener horasExtra actual de HorasTrabajadas
        const resHoras = await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .query(`SELECT horasExtra FROM HorasTrabajadas WHERE operadorId = @operadorId`);
        
        let horasExtraActuales = resHoras.recordset[0] ? (resHoras.recordset[0].horasExtra || 0) : 0;

        // Restar las horas correspondientes
        const nuevasHorasExtra = Math.max(horasExtraActuales - horasADescontar, 0); // Evita valores negativos

        await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .input('horasExtra', sql.Int, nuevasHorasExtra)
            .query(`
                UPDATE HorasTrabajadas
                SET horasExtra = @horasExtra
                WHERE operadorId = @operadorId
            `);

        console.log(`Horas extra actualizadas para operador ${operadorId}. Nuevas horasExtra: ${nuevasHorasExtra}`);

        // Eliminar la ausencia
        await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .input('fecha', sql.Date, fecha)
            .query(`
                DELETE FROM HistorialAusencias
                WHERE operadorId = @operadorId AND CONVERT(date, fecha) = @fecha
            `);

        res.json({ mensaje: 'Ausencia eliminada correctamente y horasExtra actualizadas' });

    } catch (error) {
        console.error('Error en eliminarAusencia:', error);
        res.status(500).json({ error: 'Error eliminando ausencia', mensaje: error.message });
    }
}

async getRegistroHorasDiarias(req, res) {
  try {
      const { operadorId } = req.params;
      if (!operadorId) {
          return res.status(400).json({ error: "El operadorId es requerido" });
      }

      const pool = await getConnection();
      const result = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .query(`
              SELECT TOP 10 * 
              FROM RegistroHorasDiarias
              WHERE operadorId = @operadorId
              ORDER BY fecha DESC
          `);

      return res.status(200).json(result.recordset);
  } catch (error) {
      console.error('❌ Error en getRegistroHorasDiarias:', error);
      return res.status(500).json({ error: "Error interno del servidor" });
  }
}




}

module.exports = HorasController;

