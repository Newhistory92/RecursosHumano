const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO,TIPOS_LICENCIA } = require('../utils/type');
const configService = require('../config/serverLicencia');
const dataService = require('./dataService');

class LicenciasService {
  async actualizarUsoLicencias(operadorId, tipo, anio, cantidadPost) {
    const pool = await getConnection();
    
    try {
      // Consultar si ya existe un registro en UsoLicencias para este operador, tipo y anio
      const existingResult = await pool.request()
      .input('operadorId', sql.VarChar, operadorId)
      .input('tipo', sql.VarChar(50), tipo)
      .input('anio', sql.Int, anio)
      .query(QUERIES.getUsoLicencias);
  
      let newTotal;
      if (existingResult.recordset.length > 0) {
        // Existe: sumar la cantidad del POST al valor actual
        const existingTotal = existingResult.recordset[0].totalUsado || 0;
        newTotal = existingTotal + cantidadPost;
        console.log(`Registro encontrado en UsoLicencias. Valor actual: ${existingTotal}. Sumando cantidad ${cantidadPost} para obtener: ${newTotal}`);
        
        // Actualizar el registro con el nuevo total
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('tipo', sql.VarChar(50), tipo)
          .input('anio', sql.Int, anio)
          .input('totalUsado', sql.Int, newTotal)
          .query(QUERIES.updateTotalUsado);
          console.log("UPDATE realizado en UsoLicencias");
      } else {
        // No existe: insertar un nuevo registro con totalUsado = cantidadPost
        newTotal = cantidadPost;
        console.log(`No se encontró registro en UsoLicencias para operadorId ${operadorId}, tipo ${tipo}, anio ${anio}. Insertando nuevo registro con totalUsado = ${newTotal}`);
        
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('tipo', sql.VarChar(50), tipo)
          .input('anio', sql.Int, anio)
          .input('totalUsado', sql.Int, newTotal)
          .query(QUERIES.insertTotalUsado);
          console.log("INSERT realizado en UsoLicencias");
      }
      
      // Invalidar caché
      dataService.invalidateOperadorCache(operadorId);
      
      return { 
        success: true,
        totalUsado: newTotal,
        mensaje: `Total de días usados actualizado para ${tipo}: ${newTotal}`
      };
    } catch (error) {
      console.error('Error actualizando uso de licencias:', error);
      throw error;
    }
  }
  static async calcularDiasDisponibles(operadorId, tipo, anio) {
    try {
      const personalData = await dataService.loadPersonalData(operadorId);
      const licenciasData = await dataService.loadLicenciasData(operadorId, tipo, anio);
      const totalUsado = licenciasData.totalUsado || 0;
         
      if (tipo === 'Profilactica') {
        if (personalData.condicionLaboral !== 'Medico') {
          return {
            usado: 0,
            total: 0,
            disponible: 0,
            error: 'Solo el personal médico puede usar licencias profilácticas'
          };
        }
        return {
          usado: totalUsado,
          total: DIAS_POR_TIPO.Profilactica.dias,
          disponible: Math.max(0, DIAS_POR_TIPO.Profilactica.dias - totalUsado)
        };
      }

      // Si es Parte_Medico, retorna sin límite
      if (tipo === 'Parte_Medico') {
        return { usado: totalUsado, total: null, disponible: null };
      }

      let diasTotales;

      // Si es Licencia, el cálculo depende de la condición laboral
      if (tipo === 'Licencia') {
        diasTotales = await configService.calcularDiasSegunAntiguedad(
          personalData.fechaInicioPlanta,
          personalData.condicionLaboral,
          personalData.fechaInicioTrabj,
          operadorId
        );
      } else {
        // Para otros tipos, usar DIAS_POR_TIPO
        diasTotales = DIAS_POR_TIPO[tipo] || 0;
      }

      return {
        usado: totalUsado,
        total: diasTotales,
        disponible: Math.max(0, diasTotales - totalUsado)
      };
    } catch (error) {
      console.error('Error calculando días disponibles:', error);
      throw error;
    }
  }

  async agendarLicencia(operadorId, tipo, fechaInicio, fechaFin, anio, cantidad) {
    const pool = await getConnection();
    try {
      // Se inserta la licencia usando la query parametrizada de QUERIES.insertLicencia
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('fechaInicio', sql.Date, fechaInicio)
        .input('fechaFin', sql.Date, fechaFin)
        .input('cantidad', sql.Int, cantidad)
        .input('tipo', sql.VarChar, tipo)
        .input('anio', sql.Int, anio)
        .input('estado', sql.VarChar, 'Aprobado')
        .input('updatedAt', sql.DateTime, new Date())
        .query(QUERIES.insertLicencia);
      
      // Luego, se actualiza UsoLicencias: se suma la cantidad insertada.
      await this.actualizarUsoLicencias(operadorId, tipo, anio, cantidad);
      
      return { success: true, mensaje: 'Licencia agendada correctamente' };
    } catch (error) {
      console.error('Error al agendar licencia:', error);
      throw error;
    }
  }
  
  async getResumenLicencias(operadorId) {
    const hoy = new Date();
    const currentYear = hoy.getFullYear();
    const activeYearLicencia = hoy.getMonth() < 9 ? currentYear - 1 : currentYear;
  
    try {
      const personalData = await dataService.loadPersonalData(operadorId);
      let diasLicencia;
  
      // Determinar días de licencia según condición laboral
      if (personalData.condicionLaboral === 'Contratado') {
        diasLicencia = DIAS_POR_TIPO.Licencia.Contratado;
      } else {
        diasLicencia = await configService.calcularDiasSegunAntiguedad(
          personalData.fechaInicioPlanta,
          personalData.condicionLaboral,
          personalData.fechaInicioTrabj,
          operadorId
        );
      }
  
      // Obtener información del operador
      const pool = await getConnection();
      const operadorResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(QUERIES.getOperadorById);
  
      if (!operadorResult.recordset[0]) {
        throw new Error('Operador no encontrado');
      }
      const { sexo } = operadorResult.recordset[0];
  
      // Filtrar tipos de licencia según el sexo
      const getTiposLicenciaPermitidos = (sexo) => {
        let tipos = [...TIPOS_LICENCIA]; // Clonar el arreglo original
        const sexoNormalized = sexo ? sexo.trim().toLowerCase() : "";
  
        if (sexoNormalized === 'masculino') {
          tipos = tipos.filter(tipo => tipo !== 'Maternidad');
        } else if (sexoNormalized === 'femenino') {
          tipos = tipos.filter(tipo => tipo !== 'Paternidad');
        }
        return tipos;
      };
  
      const tiposLicencia = getTiposLicenciaPermitidos(sexo);
  
      const resumen = await Promise.all(
        tiposLicencia.map(async (tipo) => {
          const años = tipo === 'Licencia' ? 
            [activeYearLicencia, activeYearLicencia - 1, activeYearLicencia - 2] :
            [currentYear];
  
          const usoAnual = await Promise.all(
            años.map(async (anio) => {
              const { usado, total, disponible } = await LicenciasService.calcularDiasDisponibles(operadorId, tipo, anio);
              return {
                anio,
                usado,
                disponible,
                total,
                displayFormat: total === null ? `${usado}` : `${usado}/${total}`,
                resumen: total === null ? `${usado}` : `${usado}/${total}`
              };
            })
          );
  
          // Obtener historial detallado
          const historial = await dataService.loadHistorialLicencias(operadorId, tipo, currentYear);
  
          return {
            tipo,
            usoAnual,
            historial: historial.map(lic => ({
              ...lic,
              fechaInicio: lic.fechaInicio ? new Date(lic.fechaInicio).toISOString().split('T')[0] : null,
              fechaFin: lic.fechaFin ? new Date(lic.fechaFin).toISOString().split('T')[0] : null,
              createdAt: lic.createdAt ? new Date(lic.createdAt).toISOString() : null,
              updatedAt: lic.updatedAt ? new Date(lic.updatedAt).toISOString() : null
            }))
          };
        })
      );
  
      return {
        resumen,
        condicionLaboral: personalData.condicionLaboral,
        fechaIngreso: personalData.fechaInicioPlanta,
        diasLicenciaAnuales: diasLicencia
      };
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      throw error;
    }
  }
  
  
  
  
}

module.exports = new LicenciasService();