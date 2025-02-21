const sql = require("mssql")
const { dbConfig, getConnection } = require('../config/configbd');
const sincronizacionService = require('../services/sincronizacionService');
const horasService = require('../services/horasService');
const schedule = require('node-schedule');
const { validarOperadorId } = require('../utils/validaciones');

async function calcularYActualizarHorasExtra() {
    try {
        // Conectar a la base de datos
        await sql.connect(dbConfig);

        // Obtener la fecha actual (sin la hora)
        const fechaActual = new Date().toISOString().split('T')[0];

        // Consultar los registros de HorasTrabajadas para el día actual
        const query = `
            SELECT operadorId, horaEntrada, horaSalida
            FROM HorasTrabajadas
            WHERE CONVERT(date, horaEntrada) = '${fechaActual}'
        `;
        const result = await sql.query(query);

        // Procesar cada registro
        for (const registro of result.recordset) {
            const { operadorId, horaEntrada, horaSalida } = registro;

            // Obtener las horas requeridas del operador (desde ConfigPersonal o Personal)
            const horasRequeridasQuery = `
                SELECT horasRequeridas
                FROM Personal
                WHERE operadorId = '${operadorId}'
            `;
            const horasRequeridasResult = await sql.query(horasRequeridasQuery);
            const horasRequeridas = horasRequeridasResult.recordset[0]?.horasRequeridas || 8; // Valor por defecto

            // Calcular horas trabajadas y horas extra
            const resultado = calcularHorasTrabajadas(horaEntrada, horaSalida, horasRequeridas);

            // Actualizar el total acumulado de horas extra en el Operador
            const updateQuery = `
                UPDATE Operador
                SET horasExtraAcumuladas = ISNULL(horasExtraAcumuladas, 0) + ${resultado.horasExtra}
                WHERE id = '${operadorId}'
            `;
            await sql.query(updateQuery);

            console.log(`Operador ${operadorId}: Horas extra acumuladas actualizadas.`);
        }
    } catch (err) {
        console.error('Error al calcular y actualizar horas extra:', err);
    } finally {
        // Cerrar la conexión a la base de datos
        await sql.close();
    }
}

// Programar la ejecución cada 30 minutos
const cron = require('node-cron');
cron.schedule('*/30 * * * *', () => {
    console.log('Ejecutando cálculo y actualización de horas extra...');
    calcularYActualizarHorasExtra();
});

class HorasController {
  constructor() {
    // Bind de los métodos para mantener el contexto
    this.obtenerResumen = this.obtenerResumen.bind(this);
    this.sincronizarHoras = this.sincronizarHoras.bind(this);
    this.actualizarHorasExtra = this.actualizarHorasExtra.bind(this);

    // Programar sincronización cada minuto
    schedule.scheduleJob('*/1 * * * *', async () => {
      console.log('Iniciando sincronización automática:', new Date().toISOString());
      try {
        await this.sincronizarHoras();
      } catch (error) {
        console.error('Error en sincronización automática:', error);
      }
    });
  }

  async actualizarHorasExtra(req, res) {
    try {
      const { operadorId } = req.params;
      const { horasExtra } = req.body;

      if (!validarOperadorId(operadorId)) {
        return res.status(400).json({
          error: 'ID de operador inválido',
          mensaje: `El ID del operador '${operadorId}' no tiene un formato válido`
        });
      }

      const pool = await getConnection();
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('horasExtra', sql.Float, horasExtra)
        .query(`
          UPDATE HorasTrabajadas
          SET horasExtra = @horasExtra,
              updatedAt = GETDATE()
          WHERE operadorId = @operadorId
        `);

      res.json({
        mensaje: 'Horas extra actualizadas correctamente',
        operadorId,
        horasExtra
      });

    } catch (error) {
      console.error('Error actualizando horas extra:', error);
      res.status(500).json({
        error: 'Error actualizando horas extra',
        mensaje: error.message
      });
    }
  }

  async obtenerResumen(req, res) {
    try {
      const { operadorId } = req.params;
      console.log('Recibido operadorId:', operadorId, 'tipo:', typeof operadorId);

      if (!validarOperadorId(operadorId)) {
        return res.status(400).json({
          error: 'ID de operador inválido',
          mensaje: `El ID del operador '${operadorId}' no tiene un formato válido`,
          formatoEsperado: 'Alfanumérico con guiones permitidos'
        });
      }

      const resumen = await sincronizacionService.obtenerResumenOperador(operadorId);
      res.json(resumen);

    } catch (error) {
      console.error('Error en obtenerResumen:', error);
      res.status(500).json({
        error: 'Error obteniendo resumen',
        mensaje: error.message
      });
    }
  }

  async sincronizarHoras(req, res) {
    try {
      const resultado = await sincronizacionService.sincronizarRegistrosDiarios();
      
      if (res) { // Si es llamado como endpoint
        res.json({
          mensaje: 'Sincronización completada',
          resultado
        });
      } else { // Si es llamado por el scheduler
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
}

// Exportar una instancia de la clase
module.exports = HorasController;