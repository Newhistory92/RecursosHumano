const sql = require('mssql');
const { getConnection } = require('./configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO } = require('../utils/type');

class ConfigService {
  
  async calcularDiasSegunAntiguedad(fechaInicioPlanta, condicionLaboral, fechaInicioTrabj, operadorId) {
    console.log('Iniciando cálculo con:', {
      condicionLaboral,
      operadorId,
      fechaInicioPlanta,
      fechaInicioTrabj
    });
  
    // Normalizar condicionLaboral (si viene como array, tomar el primer elemento)
    const tipoContrato = Array.isArray(condicionLaboral) ? condicionLaboral[0] : condicionLaboral;
    console.log('Tipo de contrato normalizado:', tipoContrato);
  
    // Si la fechaInicioPlanta es null o es la fecha "1900-01-01T00:00:00.000Z", no se puede calcular
    if (!fechaInicioPlanta || new Date(fechaInicioPlanta).toISOString() === "1900-01-01T00:00:00.000Z") {
      console.log('FechaInicioPlanta no válida (null o 1900-01-01), asignando 0 días');
      return await this.actualizarDiasLicencia(operadorId, 0);
    }
  
    // Para contratados, se usa fechaInicioTrabj
    if (tipoContrato === 'Contratado') {
      if (!fechaInicioTrabj) {
        console.log('No se proporcionó fechaInicioTrabj, asignando 10 días fijos');
        return await this.actualizarDiasLicencia(operadorId, 10);
      }
      const hoy = new Date();
      const inicio = new Date(fechaInicioTrabj);
      const mesesTrabajados = this.calcularMesesTrabajados(inicio, hoy);
      console.log('Meses trabajados como contratado:', mesesTrabajados);
  
      if (mesesTrabajados < 12) {
        const diasCalculados = Math.floor((DIAS_POR_TIPO.Licencia.Contratado * mesesTrabajados) / 12);
        console.log('Días calculados proporcionalmente:', diasCalculados);
        return await this.actualizarDiasLicencia(operadorId, diasCalculados);
      }
      console.log('Tiene 12 o más meses, asignando días según configuración');
      return await this.actualizarDiasLicencia(operadorId, DIAS_POR_TIPO.Licencia.Contratado);
    }
  
    // Para otros casos, se utiliza fechaInicioPlanta
    const hoy = new Date();
    const inicio = new Date(fechaInicioPlanta);
    const añosAntiguedad = Math.floor((hoy.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 365));
    console.log('Años de antigüedad calculados:', añosAntiguedad);
  
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
    return await this.actualizarDiasLicencia(operadorId, diasCalculados);
  }

  calcularMesesTrabajados(fechaInicio, fechaFin) {
    const mesesDiferencia = (fechaFin.getFullYear() - fechaInicio.getFullYear()) * 12 + 
                           (fechaFin.getMonth() - fechaInicio.getMonth());
    
    // Si el día del mes final es menor que el día del mes inicial, restar un mes
    if (fechaFin.getDate() < fechaInicio.getDate()) {
      return Math.max(0, mesesDiferencia - 1);
    }
    
    return Math.max(0, mesesDiferencia);
  }

  // calcularAñosAntiguedad(fechaInicio, fechaActual) {
  //   const diferenciaMeses = (fechaActual.getFullYear() - fechaInicio.getFullYear()) * 12 + 
  //                           (fechaActual.getMonth() - fechaInicio.getMonth());
  //   return diferenciaMeses / 12;
  // }

  // async calcularDiasRestantes(operadorId, diasCalculados) {
  //   try {
  //     const pool = await getConnection();
  //     const hoy = new Date();
  //     const currentYear = hoy.getFullYear();

  //     // Determinar el "año activo" para licencias:
  //     // - Si hoy es antes del 1 de octubre (mes 0-8), se usa el año anterior.
  //     // - A partir del 1 de octubre, se usa el año en curso.
  //     const activeYear = hoy.getMonth() < 9 ? currentYear - 1 : currentYear;

  //     // Para efectos del resumen, la lógica de mostrar los 3 últimos años se implementa en la capa de API
  //     // (por ejemplo, consultando para los años: si activeYear = currentYear - 1, se mostrarán [currentYear-3, currentYear-2, currentYear-1])
      
  //     // Obtener las licencias del año activo
  //     const result = await pool.request()
  //       .input('operadorId', sql.VarChar, operadorId)
  //       .input('año', sql.Int, activeYear)
  //       .input('tipo', sql.VarChar, 'Licencia')
  //       .query(QUERIES.getLicenciasDelAño);

  //     if (result.recordset.length > 0) {
  //       // Calcular total usado en el año activo
  //       const diasUsados = result.recordset.reduce((total, licencia) => total + licencia.cantidad, 0);

  //       // Actualizar el uso de licencias para el año activo
  //       await pool.request()
  //         .input('operadorId', sql.VarChar, operadorId)
  //         .input('tipo', sql.VarChar, 'Licencia')
  //         .input('anio', sql.Int, activeYear)
  //         .input('totalUsado', sql.Int, diasUsados)
  //         .query(QUERIES.mergeUsoLicencias);

  //       console.log('Total de días usados en el año activo:', {
  //         activeYear,
  //         diasUsados,
  //         diasCalculados,
  //         diasRestantes: Math.max(0, diasCalculados - diasUsados)
  //       });

  //       return Math.max(0, diasCalculados - diasUsados);
  //     }
      
  //     // Si no hay registros, se actualiza el uso con 0 para el año activo
  //     await pool.request()
  //       .input('operadorId', sql.VarChar, operadorId)
  //       .input('tipo', sql.VarChar, 'Licencia')
  //       .input('anio', sql.Int, activeYear)
  //       .input('totalUsado', sql.Int, 0)
  //       .query(QUERIES.mergeUsoLicencias);

  //     return diasCalculados;
  //   } catch (error) {
  //     console.error('Error al obtener historial de licencias:', error);
  //     throw error;
  //   }
  // }

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
