const sql = require("mssql");
const { getConnection } = require('../config/configbd');
const sincronizacionService = require('../services/sincronizacionService');
const schedule = require('node-schedule');
const { validarOperadorId } = require('../utils/validaciones');
const reiniciarHorasExtraComisionado = require('../services/reiniciohoraExtra');

class HorasController {
  constructor() {
    // Bind de los métodos
    this.obtenerResumenHoras = this.obtenerResumenHoras.bind(this);
    this.sincronizarHoras = this.sincronizarHoras.bind(this);
    this.agregarAusencia = this.agregarAusencia.bind(this);
    this.eliminarAusencia = this.eliminarAusencia.bind(this);
    this.justificarAusencia = this.justificarAusencia.bind(this);
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
      const query = `
        SELECT horasExtra, updatedAt
        FROM HorasTrabajadas
        WHERE operadorId = @operadorId
      `;
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(query);

      if (result.recordset.length === 0) {
        return res.status(404).json({
          error: 'No se encontraron registros para el operador'
        });
      }

      const { horasExtra, updatedAt } = result.recordset[0];
      const horasExtraFormato = this.convertirDecimalAHora(horasExtra);

      res.json({ horasExtra: horasExtraFormato, updatedAt });

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

    if (!ausenciaId || typeof justificado !== 'boolean' || !condicionLaboral || !operadorId) {
      return res.status(400).json({ 
        error: 'Faltan parámetros: ausenciaId, justificado, condicionLaboral y operadorId son requeridos' 
      });
    }

    console.log(`Actualizando ausencia ${ausenciaId} a justificado = ${justificado}`);

    const pool = await getConnection();

    // 🔍 Verificar si la fechaJustificada existe en Licencias
    const result = await pool.request()
      .input('fechaJustificada', sql.Date, fechaJustificada)
      .query(`
        SELECT COUNT(*) as existe 
        FROM Licencias 
        WHERE fecha = @fechaJustificada 
        AND estado = 'Aprobado'
      `);

    if (result.recordset[0].existe === 0) {
      return res.status(400).json({ error: 'La fecha no existe en Licencias' });
    }

    // ✅ Si existe la fecha en Licencias, actualizar la ausencia
    await pool.request()
      .input('ausenciaId', sql.Int, ausenciaId)
      .input('justificado', sql.Bit, justificado)
      .query(`
        UPDATE HistorialAusencias
        SET justificado = @justificado
        WHERE id = @ausenciaId
      `);

    console.log(`Ausencia ${ausenciaId} actualizada, justificado: ${justificado}`);

    // Si se marca como justificado, se procede a ajustar las horas extra
    if (justificado) {
      console.log(`Operador asociado a ausencia ${ausenciaId}: ${operadorId}`);

      // Obtener las horasExtra actuales del operador
      const resHoras = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT horasExtra 
          FROM HorasTrabajadas 
          WHERE operadorId = @operadorId
        `);

      let horasExtraActuales = resHoras.recordset[0] ? (resHoras.recordset[0].horasExtra || 0) : 0;
      console.log(`Horas extra actuales para operador ${operadorId}: ${horasExtraActuales}`);

      // Definir la penalización según la condición laboral
      const HORAS_POR_CONDICION = {
        'Contratado': 6,
        'Planta_Permanente': 7
      };
      const penalizacion = HORAS_POR_CONDICION[condicionLaboral] || 8;
      console.log(`Aplicando penalización de ${penalizacion} horas para condición ${condicionLaboral}`);

      // Calcular las nuevas horasExtra permitiendo que sean negativas
      const nuevasHorasExtra = horasExtraActuales - penalizacion;
      console.log(`Nuevas horasExtra para operador ${operadorId}: ${nuevasHorasExtra}`);

      // Actualizar la tabla HorasTrabajadas con el nuevo valor de horasExtra
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('horasExtra', sql.Float, nuevasHorasExtra)
        .query(`
          UPDATE HorasTrabajadas 
          SET horasExtra = @horasExtra, updatedAt = GETDATE()
          WHERE operadorId = @operadorId
        `);

      console.log(`Horas extra actualizadas para operador ${operadorId}`);
    }

    res.status(200).json({ mensaje: 'Ausencia actualizada y penalización de horas extra corregida' });
  } catch (error) {
    console.error('Error al justificar ausencia:', error);
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

