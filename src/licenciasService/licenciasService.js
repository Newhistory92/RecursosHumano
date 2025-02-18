const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO,TIPOS_LICENCIA } = require('../utils/type');
const configService = require('../config/serverLicencia');
const dataService = require('./dataService');

class LicenciasService {
  async actualizarUsoLicencias(operadorId, tipo, anio) {
    const pool = await getConnection();
    
    try {
      // 1. Obtener el total de días usados de la tabla Licencias
      const totalResult = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .query(QUERIES.getTotalUsado);

      const totalUsado = totalResult.recordset[0].totalUsado || 0;

      // 2. Actualizar la tabla UsoLicencias con el total calculado
      await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('tipo', sql.VarChar(50), tipo)
        .input('anio', sql.Int, anio)
        .input('totalUsado', sql.Int, totalUsado)
        .query(QUERIES.mergeUsoLicencias);

      // 3. Invalidar caché para reflejar los cambios
      dataService.invalidateOperadorCache(operadorId);

      return { 
        success: true,
        totalUsado,
        mensaje: `Total de días usados actualizado para ${tipo}: ${totalUsado}`
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
        if (personalData.condicionLaboral === 'Contratado') {
          diasTotales = DIAS_POR_TIPO.Licencia.Contratado;
        } else {
          diasTotales = await configService.calcularDiasSegunAntiguedad(
            personalData.fechaInicioPlanta,
            personalData.condicionLaboral,
            operadorId
          );
        }
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
              fechaFin: lic.fechaFin ? new Date(lic.fechaFin).toISOString().split('T')[0] : null
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