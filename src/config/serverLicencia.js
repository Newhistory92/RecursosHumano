const sql = require('mssql');
const { getConnection } = require('./configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO } = require('../utils/type');

class ConfigService {
  async calcularDiasSegunAntiguedad(fechaInicioPlanta, condicionLaboral, operadorId) {
    console.log('Iniciando cálculo con:', {
      condicionLaboral,
      operadorId,
      fechaInicioPlanta
    });

    // Normalizar condicionLaboral (si viene como array, tomar el primer elemento)
    const tipoContrato = Array.isArray(condicionLaboral) ? condicionLaboral[0] : condicionLaboral;
    console.log('Tipo de contrato normalizado:', tipoContrato);

    // Si es contratado, asignar directamente 10 días sin cálculos
    if (tipoContrato === 'Contratado') {
      console.log('Es contratado, asignando 10 días fijos');
      return await this.actualizarDiasLicencia(operadorId, 10);
    }

    // Para el resto, calcular años de antigüedad
    const hoy = new Date();
    const inicio = new Date(fechaInicioPlanta);
    const añosAntiguedad = Math.floor(
      (hoy.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 365)
    );

    console.log('Años de antigüedad calculados:', añosAntiguedad);

    // Asignar días según rangos de años
    let diasCalculados;
    if (añosAntiguedad < 0.5) {
      diasCalculados = 0;      // Menos de 6 meses
    } else if (añosAntiguedad <= 5) {
      diasCalculados = 10;     // De 6 meses a 5 años
    } else if (añosAntiguedad <= 10) {
      diasCalculados = 15;     // De 5 a 10 años
    } else if (añosAntiguedad <= 20) {
      diasCalculados = 25;     // De 10 a 20 años
    } else {
      diasCalculados = 30;     // Más de 20 años
    }

    console.log('Días asignados según antigüedad:', diasCalculados);

    // Calcular días restantes considerando licencias ya tomadas para el año activo
    const diasRestantes = await this.calcularDiasRestantes(operadorId, diasCalculados);
    console.log('Días restantes después de descontar licencias:', diasRestantes);
    
    return await this.actualizarDiasLicencia(operadorId, diasRestantes);
  }

  calcularAñosAntiguedad(fechaInicio, fechaActual) {
    const diferenciaMeses = (fechaActual.getFullYear() - fechaInicio.getFullYear()) * 12 + 
                            (fechaActual.getMonth() - fechaInicio.getMonth());
    return diferenciaMeses / 12;
  }

  async calcularDiasRestantes(operadorId, diasCalculados) {
    try {
      const pool = await getConnection();
      const hoy = new Date();
      const currentYear = hoy.getFullYear();

      // Determinar el "año activo" para licencias:
      // - Si hoy es antes del 1 de octubre (mes 0-8), se usa el año anterior.
      // - A partir del 1 de octubre, se usa el año en curso.
      const activeYear = hoy.getMonth() < 9 ? currentYear - 1 : currentYear;

      // Para efectos del resumen, la lógica de mostrar los 3 últimos años se implementa en la capa de API
      // (por ejemplo, consultando para los años: si activeYear = currentYear - 1, se mostrarán [currentYear-3, currentYear-2, currentYear-1])
      
      // Obtener las licencias del año activo
      const result = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('año', sql.Int, activeYear)
        .input('tipo', sql.VarChar, 'Licencia')
        .query(QUERIES.getLicenciasDelAño);

      if (result.recordset.length > 0) {
        // Calcular total usado en el año activo
        const diasUsados = result.recordset.reduce((total, licencia) => total + licencia.cantidad, 0);

        // Actualizar el uso de licencias para el año activo
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('tipo', sql.VarChar, 'Licencia')
          .input('anio', sql.Int, activeYear)
          .input('totalUsado', sql.Int, diasUsados)
          .query(QUERIES.mergeUsoLicencias);

        console.log('Total de días usados en el año activo:', {
          activeYear,
          diasUsados,
          diasCalculados,
          diasRestantes: Math.max(0, diasCalculados - diasUsados)
        });

        return Math.max(0, diasCalculados - diasUsados);
      }
      
      // Si no hay registros, se actualiza el uso con 0 para el año activo
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar, 'Licencia')
        .input('anio', sql.Int, activeYear)
        .input('totalUsado', sql.Int, 0)
        .query(QUERIES.mergeUsoLicencias);

      return diasCalculados;
    } catch (error) {
      console.error('Error al obtener historial de licencias:', error);
      throw error;
    }
  }

  async actualizarDiasLicencia(operadorId, dias) {
    console.log('Actualizando días de licencia:', {
      operadorId,
      diasAAsignar: dias
    });

    try {
      const pool = await getConnection();
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('diasLicenciaAsignados', sql.Int, dias)
        .query(QUERIES.updateDiasAsignados);
      
      console.log('Días actualizados exitosamente');
      return dias;
    } catch (error) {
      console.error('Error actualizando diasLicenciaAsignados:', error);
      throw error;
    }
  }
}

module.exports = new ConfigService();
