const sql = require("mssql");
const { dbConfig, getConnection } = require('../config/configbd');
const sincronizacionService = require('../services/sincronizacionService');
const schedule = require('node-schedule');
const { validarOperadorId } = require('../utils/validaciones');

class HorasController {
  constructor() {
    // Bind de los métodos
    this.obtenerResumenHoras = this.obtenerResumenHoras.bind(this);
    this.sincronizarHoras = this.sincronizarHoras.bind(this);

    // Programar sincronización cada minuto
    schedule.scheduleJob('*/1 * * * *', async () => {
      try {
        // Usar fecha estática por ahora
        const fecha = "22/04/2022";
        await sincronizacionService.sincronizarRegistrosDiarios(fecha);
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
      // Usar fecha estática en lugar de fecha actual
      const fecha = "22/04/2022";
      // const fechaActual = new Date().toISOString().split('T')[0]; // Comentado por ahora
      
      const resultado = await sincronizacionService.sincronizarRegistrosDiarios(fecha);
      
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
}

module.exports = HorasController;
