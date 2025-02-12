const sql = require('mssql');
const { dbConfig } = require('../config/configbd');
const schedule = require('node-schedule');

const licenciasController = {
  // Calcular días de licencia según antigüedad
  async calcularDiasSegunAntiguedad(fechaInicio) {
    const hoy = new Date();
    const inicio = new Date(fechaInicio);
    const mesesAntiguedad = (hoy.getFullYear() - inicio.getFullYear()) * 12 + 
                           (hoy.getMonth() - inicio.getMonth());
    
    // Si es el primer año, calcular proporcionalmente
    if (hoy.getFullYear() === inicio.getFullYear()) {
      const mesesRestantes = 12 - inicio.getMonth();
      const diasProporcionales = Math.floor((10 * mesesRestantes) / 12);
      return diasProporcionales;
    }

    // Calcular según antigüedad
    const añosAntiguedad = mesesAntiguedad / 12;

    if (mesesAntiguedad < 6) return 0;
    if (añosAntiguedad <= 5) return 10;
    if (añosAntiguedad <= 10) return 15;
    if (añosAntiguedad <= 20) return 25;
    return 30;
  },

  // Actualizar días asignados en Personal
  async actualizarDiasAsignados(operadorId) {
    const pool = await sql.connect(dbConfig);
    
    try {
      // Obtener información del personal
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT fechaInicioTrabj, condicionLaboral
          FROM Personal
          WHERE operadorId = @operadorId
        `);

      if (!result.recordset[0]) throw new Error('Operador no encontrado');

      const { fechaInicioTrabj } = result.recordset[0];
      const diasAsignados = await this.calcularDiasSegunAntiguedad(fechaInicioTrabj);

      // Actualizar días asignados
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('diasAsignados', sql.Int, diasAsignados)
        .query(`
          UPDATE Personal
          SET diasLicenciaAsignados = @diasAsignados
          WHERE operadorId = @operadorId
        `);

      return diasAsignados;
    } catch (error) {
      console.error('Error actualizando días asignados:', error);
      throw error;
    }
  },

  // Actualizar registro en UsoLicencias
  async actualizarUsoLicencias(operadorId, tipo, anio) {
    const pool = await sql.connect(dbConfig);
    
    try {
      // Calcular total usado
      const totalResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .query(`
          SELECT COALESCE(SUM(cantidad), 0) as totalUsado
          FROM Licencias
          WHERE operadorId = @operadorId
          AND tipo = @tipo
          AND anio = @anio
          AND estado = 'APROBADA'
        `);

      const totalUsado = totalResult.recordset[0].totalUsado;

      // Actualizar o insertar en UsoLicencias
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .input('totalUsado', sql.Int, totalUsado)
        .query(`
          MERGE INTO UsoLicencias AS target
          USING (VALUES (@operadorId, @tipo, @anio, @totalUsado)) 
            AS source (operadorId, tipo, anio, totalUsado)
          ON target.operadorId = source.operadorId 
            AND target.tipo = source.tipo 
            AND target.anio = source.anio
          WHEN MATCHED THEN
            UPDATE SET totalUsado = source.totalUsado
          WHEN NOT MATCHED THEN
            INSERT (operadorId, tipo, anio, totalUsado)
            VALUES (source.operadorId, source.tipo, source.anio, source.totalUsado);
        `);
    } catch (error) {
      console.error('Error actualizando uso de licencias:', error);
      throw error;
    }
  },

  // Calcular días disponibles por tipo y año
  async calcularDiasDisponibles(operadorId, tipo, anio) {
    const pool = await sql.connect(dbConfig);
    
    try {
      // Obtener configuración del operador
      const configResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT p.condicionLaboral, p.diasLicenciaAsignados
          FROM Personal p
          WHERE p.operadorId = @operadorId
        `);

      if (!configResult.recordset[0]) throw new Error('Operador no encontrado');

      const { condicionLaboral, diasLicenciaAsignados } = configResult.recordset[0];
      const config = await this.getConfiguracion(condicionLaboral);

      // Obtener uso actual
      const usoResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .query(`
          SELECT totalUsado
          FROM UsoLicencias
          WHERE operadorId = @operadorId
          AND tipo = @tipo
          AND anio = @anio
        `);

      const totalUsado = usoResult.recordset[0]?.totalUsado || 0;
      let diasDisponibles = 0;

      // Calcular días disponibles según tipo
      switch (tipo) {
        case 'Licencia':
          diasDisponibles = diasLicenciaAsignados - totalUsado;
          break;
        case 'Parte_Medico':
          diasDisponibles = config.partemedico - totalUsado;
          break;
        case 'Profilactica':
          diasDisponibles = config.profilacticas - totalUsado;
          break;
        case 'Particular':
          diasDisponibles = config.particulares - totalUsado;
          break;
        case 'Matrimonio':
          diasDisponibles = config.matrimonio - totalUsado;
          break;
        case 'Matrimonio_Hijo':
          diasDisponibles = config.matrimonio_hijo - totalUsado;
          break;
        case 'Paternidad':
          diasDisponibles = config.paternidad - totalUsado;
          break;
        case 'Maternidad':
          diasDisponibles = config.maternidad - totalUsado;
          break;
        case 'Fallecimiento':
          diasDisponibles = config.fallecimiento - totalUsado;
          break;
        case 'Enfermedad':
          diasDisponibles = config.enfermedad - totalUsado;
          break;
        case 'Guarda_Tenencia':
          diasDisponibles = config.guarda_tenencia - totalUsado;
          break;
      }

      return Math.max(0, diasDisponibles);
    } catch (error) {
      console.error('Error calculando días disponibles:', error);
      throw error;
    }
  },

  // Actualización automática diaria
  async actualizacionAutomatica() {
    const pool = await sql.connect(dbConfig);
    const anioActual = new Date().getFullYear();
    
    try {
      // Obtener todos los operadores
      const operadores = await pool.request().query(`
        SELECT DISTINCT o.id
        FROM Operador o
        JOIN Personal p ON o.id = p.operadorId
      `);

      for (const operador of operadores.recordset) {
        // Actualizar días asignados
        await this.actualizarDiasAsignados(operador.id);

        // Actualizar uso de cada tipo de licencia
        const tiposLicencia = [
          'Licencia', 'Parte_Medico', 'Profilactica', 'Particular',
          'Matrimonio', 'Matrimonio_Hijo', 'Paternidad', 'Maternidad',
          'Fallecimiento', 'Enfermedad', 'Guarda_Tenencia'
        ];

        for (const tipo of tiposLicencia) {
          await this.actualizarUsoLicencias(operador.id, tipo, anioActual);
        }
      }

      console.log('Actualización automática completada:', new Date());
    } catch (error) {
      console.error('Error en actualización automática:', error);
      throw error;
    }
  },

  // Programar actualización automática (16:00 horas)
  iniciarActualizacionAutomatica() {
    schedule.scheduleJob('0 16 * * *', async () => {
      console.log('Iniciando actualización automática de licencias');
      try {
        await this.actualizacionAutomatica();
      } catch (error) {
        console.error('Error en la actualización programada:', error);
      }
    });
  },

  // Endpoint para obtener resumen de licencias
  async getResumenLicencias(req, res) {
    const { operadorId } = req.params;
    const anioActual = new Date().getFullYear();

    try {
      const pool = await sql.connect(dbConfig);
      const resumen = [];

      // Obtener información del personal
      const personalInfo = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`
          SELECT diasLicenciaAsignados, fechaInicioTrabj
          FROM Personal
          WHERE operadorId = @operadorId
        `);

      const diasLicenciaAsignados = personalInfo.recordset[0]?.diasLicenciaAsignados;

      // Obtener todos los tipos de licencias
      const tiposLicencia = [
        'Licencia', 'Parte_Medico', 'Profilactica', 'Particular',
        'Matrimonio', 'Matrimonio_Hijo', 'Paternidad', 'Maternidad',
        'Fallecimiento', 'Enfermedad', 'Guarda_Tenencia'
      ];

      for (const tipo of tiposLicencia) {
        // Obtener uso histórico por año (últimos 3 años para licencias ordinarias)
        const años = tipo === 'Licencia' ? 
          [anioActual, anioActual - 1, anioActual - 2] : 
          [anioActual];

        const usoAnual = await Promise.all(años.map(async (anio) => {
          const uso = await pool.request()
            .input('operadorId', sql.VarChar, operadorId)
            .input('tipo', sql.VarChar(50), tipo)
            .input('anio', sql.Int, anio)
            .query(`
              SELECT totalUsado
              FROM UsoLicencias
              WHERE operadorId = @operadorId
              AND tipo = @tipo
              AND anio = @anio
            `);

          return {
            anio,
            usado: uso.recordset[0]?.totalUsado || 0,
            disponible: await this.calcularDiasDisponibles(operadorId, tipo, anio)
          };
        }));

        resumen.push({
          tipo,
          diasTotales: tipo === 'Licencia' ? diasLicenciaAsignados : null,
          usoAnual
        });
      }

      res.json(resumen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// Iniciar la actualización automática al arrancar el servidor
licenciasController.iniciarActualizacionAutomatica();
module.exports = licenciasController;
