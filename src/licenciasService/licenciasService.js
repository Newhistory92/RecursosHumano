const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO,TIPOS_LICENCIA } = require('../utils/type');
const configService = require('../config/serverLicencia');
const dataService = require('./dataService');
const horasService = require('../services/horasService');
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

  
  
  async agendarLicencia(operadorId, tipo, fechaInicio, fechaFin, anio, cantidad) {
    const pool = await getConnection();
    try {
      // 🔹 Insertar la nueva licencia
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
  
      // 🔹 Actualizar UsoLicencias
      await this.actualizarUsoLicencias(operadorId, tipo, anio, cantidad);
  
      // 🔹 Buscar ausencias que coincidan con la fecha de la licencia
      const resultadoAusencias = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .input('fechaInicio', sql.Date, fechaInicio)
        .input('fechaFin', sql.Date, fechaFin)
        .query(`
          SELECT id FROM HistorialAusencias 
          WHERE operadorId = @operadorId 
          AND fecha BETWEEN @fechaInicio AND @fechaFin
        `);
        
        if (resultadoAusencias.recordset.length > 0) {
        // 🔹 Extraer el ID de la ausencia
        const ausenciaId = resultadoAusencias.recordset[0].id;
        
        // 🔹 Obtener la condición laboral del operador desde la tabla Personal
        const resultadoCondicion = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
          .query(`SELECT condicionLaboral FROM Personal WHERE operadorId = @operadorId`);
          
        if (resultadoCondicion.recordset.length === 0) {
          throw new Error('No se encontró la condición laboral del operador.');
        }
        
        const condicionLaboral = resultadoCondicion.recordset[0].condicionLaboral;
  
        // 🔹 Llamar a horasService.justificarAusencia con los parámetros correctos
        await horasService.justificarAusencia(ausenciaId, true, condicionLaboral, fechaInicio, operadorId);
  
        console.log(`✅ Ausencia ${ausenciaId} justificada para operador ${operadorId} con condición ${condicionLaboral}`);
      }
      
      return { success: true, mensaje: 'Licencia agendada correctamente' };
    } catch (error) {
      console.error('❌ Error al agendar licencia:', error);
      throw error;
    }
  }

  async actualizarLicencia(
    operadorId,
    id,
    fechaInicio,
    fechaFin,
    cantidad,
    tipo,
    usoId,
    oldanio,
    oldCantidad,
    oldTipo
  ) {
    console.log("Iniciando actualización de licencia...");
    const pool = await getConnection();
    const currentDate = new Date();
    
    try {
      console.log("Datos recibidos:", {
        operadorId,
        id,
        fechaInicio,
        fechaFin,
        cantidad,
        tipo,
        usoId,
        oldanio,
        oldCantidad,
        oldTipo,
      });
      
      // Determinar si solo cambiaron las fechas (cantidad y tipo permanecen iguales)
      const soloFechasCambiadas = cantidad === oldCantidad && tipo === oldTipo;
      console.log("¿Solo cambiaron las fechas?", soloFechasCambiadas);
      
      if (!soloFechasCambiadas) {
        // Caso 1: Cambio de tipo
        if (tipo !== oldTipo) {
          console.log("Cambio de tipo detectado, actualizando UsoLicencias...");
          await pool
            .request()
            .input("usoId", sql.Int, usoId)
            .input("oldCantidad", sql.Int, oldCantidad)
            .query(
              `UPDATE UsoLicencias SET totalUsado = totalUsado - @oldCantidad WHERE id = @usoId`
            );
  
            console.log("Se restó la cantidad antigua, ahora se actualiza el nuevo tipo...");
          await this.actualizarUsoLicencias(operadorId, tipo, oldanio, cantidad);
        }
        // Caso 2: Cambio en la cantidad (mismo tipo)
        else if (cantidad !== oldCantidad) {
          const delta = cantidad - oldCantidad;
          console.log("Cambio de cantidad detectado, delta:", delta);
          await pool
            .request()
            .input("usoId", sql.Int, usoId)
            .input("delta", sql.Int, delta)
            .query(
              `UPDATE UsoLicencias SET totalUsado = totalUsado + @delta WHERE id = @usoId`
            );
          

          }
  
          console.log("Invalidando caché para operador", operadorId);
        dataService.invalidateOperadorCache(operadorId);
      }
  
      console.log("Actualizando la tabla Licencias...");
      const result = await pool
        .request()
        .input("fechaInicio", sql.Date, fechaInicio)
        .input("fechaFin", sql.Date, fechaFin)
        .input("cantidad", sql.Int, cantidad)
        .input("tipo", sql.VarChar, tipo)
        .input("updatedAt", sql.DateTime, currentDate)
        .input("id", sql.Int, id)
        .input("operadorId", sql.VarChar, operadorId)
        .query(QUERIES.updateLicencia);
        
        if (!result.recordset || result.recordset.length === 0) {
          console.log("Licencia no encontrada.");
        return { error: "Licencia no encontrada", status: 404 };
      }
      console.log("Licencia actualizada exitosamente.", result.recordset[0]);
      return { data: result.recordset[0] };
    } catch (error) {
      console.error("Error al actualizar licencia:", error);
      return { error: "Error al actualizar la licencia", status: 500 };
    }
  }
  
  async  eliminarLicencia(operadorId, licenciaId, oldCantidad, usoId) {
    console.log("Iniciando eliminación de licencia...");
    
    const pool = await getConnection();
    
    try {
      console.log("Datos recibidos:", { operadorId, licenciaId, oldCantidad, usoId });
  
      // Restar la oldCantidad en UsoLicencias antes de eliminar la licencia
      console.log("Actualizando UsoLicencias, restando la cantidad antigua...");
      await pool
      .request()
      .input("usoId", sql.Int, usoId)
      .input("oldCantidad", sql.Int, oldCantidad)
      .query(`
        UPDATE UsoLicencias 
        SET totalUsado = totalUsado - @oldCantidad 
        WHERE id = @usoId
        `);
        
        console.log("Eliminando la licencia...");
        await pool
        .request()
        .input("licenciaId", sql.Int, licenciaId)
        .input("operadorId", sql.VarChar, operadorId)
        .query(`
          DELETE FROM Licencias 
          WHERE id = @licenciaId AND operadorId = @operadorId
          `);
  
          console.log("Licencia eliminada exitosamente.");
          return { success: true };
          
    } catch (error) {
      console.error("Error al eliminar licencia:", error);
      return { error: "Error al eliminar la licencia", status: 500 };
    }
  }
  

  


  async getResumenLicencias(operadorId) {
    const hoy = new Date();
    const currentYear = hoy.getFullYear();
    const activeYearLicencia = hoy.getMonth() < 9 ? currentYear - 1 : currentYear;
  
    try {
      const historialData = await dataService.loadHistorialLicencias(operadorId, currentYear);
      //console.log('Datos recibidos de loadHistorialLicencias:', historialData);
      const personalData = historialData.length > 0 ? historialData[0].personal : {}
      const diasLicencia = personalData.diasLicenciaAsignados || 0;
      const condicionLaboral = personalData.condicionLaboral || '';
      const sexo = historialData.length > 0 ? historialData[0].operador.sexo : '';
      const licenciasData =  historialData.length > 0 ? historialData[0].usoLicencia: {}
      const fechaIngreso = personalData.fechaInicioPlanta;

        // 2. Filtrar tipos de licencia según el sexo
    const getTiposLicenciaPermitidos = (sexo) => {
      let tipos = [...TIPOS_LICENCIA]; // Clonar el arreglo original de tipos de licencia
      const sexoNormalized = sexo ? sexo.trim().toLowerCase() : "";
      if (sexoNormalized === 'masculino') {
        tipos = tipos.filter(tipo => tipo !== 'Maternidad');
      } else if (sexoNormalized === 'femenino') {
        tipos = tipos.filter(tipo => tipo !== 'Paternidad');
      }
      return tipos;
    };
    const tiposLicencia = getTiposLicenciaPermitidos(sexo);

    // 3. Para cada tipo, obtener el uso anual y el historial
    const resumen = await Promise.all(
      tiposLicencia.map(async (tipo) => {
        const años = tipo === 'Licencia'
          ? [activeYearLicencia, activeYearLicencia - 1, activeYearLicencia - 2]
          : [currentYear];

        // const usoAnual = await Promise.all(
        //   años.map(async (anio) => {
        //     // Se llama a calcularDiasDisponibles con datos de licenciasData
        //     const { usado, total, disponible } = await LicenciasService.calcularDiasDisponibles(
        //       licenciasData.totalUsado, licenciasData.tipo, licenciasData.anio, diasLicencia, condicionLaboral
        //     );
        //     return {
        //       anio,
        //       usado,
        //       disponible,
        //       total,
        //       displayFormat: total === null ? `${usado}` : `${usado}/${total}`,
        //       resumen: total === null ? `${usado}` : `${usado}/${total}`
        //     };
        //   })
        // );
 const usoAnual = await Promise.all(
          años.map(async (anio) => {
            // Buscar uso de licencia en el historial
            const registroUso = historialData.find(r =>
              r.usoLicencia && r.usoLicencia.tipo === tipo && r.usoLicencia.anio === anio
            );
            const usado = registroUso ? registroUso.usoLicencia.totalUsado : 0;

            // Calcular total basado en condiciones
            let total;
            if (tipo === 'Licencia') {
              total = diasLicencia;
            } else if (tipo === 'Parte_Medico') {
              total = null; // Sin límite
            } else if (tipo === 'Profilactica') {
              total = (condicionLaboral === 'Medico' || condicionLaboral === 'Comisionado') ? DIAS_POR_TIPO[tipo] || 0 : 0;
            } else {
              total = DIAS_POR_TIPO[tipo] || 0;
            }

            // Calcular disponible
            const disponible = total !== null ? Math.max(0, total - usado) : null;

            console.log(`Tipo: ${tipo}, Año: ${anio}, Usado: ${usado}, Total: ${total}, Disponible: ${disponible}`);
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
      
        // Filtrar el historial para este tipo de licencia
        const historialPorTipo = historialData.filter(r => r.licencia && r.licencia.tipo === tipo);
        const historialFormateado = historialPorTipo.map(lic => ({
          licencia: {
            id: lic.licencia.id,
            fechaInicio: lic.licencia.fechaInicio ? new Date(lic.licencia.fechaInicio).toISOString().split('T')[0] : null,
            fechaFin: lic.licencia.fechaFin ? new Date(lic.licencia.fechaFin).toISOString().split('T')[0] : null,
            cantidad: lic.licencia.cantidad,
            tipo: lic.licencia.tipo,
            estado: lic.licencia.estado,
            anio: lic.licencia.anio,
            createdAt: lic.licencia.createdAt ? new Date(lic.licencia.createdAt).toISOString() : null,
            updatedAt: lic.licencia.updatedAt ? new Date(lic.licencia.updatedAt).toISOString() : null
          }
        }));

        return {
          tipo,
          usoAnual,
          historial: historialFormateado
        };
      })
    );
      return {
        resumen,
        condicionLaboral,
        fechaIngreso,
        diasLicenciaAnuales: diasLicencia
      };
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      throw error;
    }
  }
  
  
  
  
}

module.exports = new LicenciasService();