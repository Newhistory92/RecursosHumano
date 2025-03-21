const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const { QUERIES } = require('../utils/queries');
const { DIAS_POR_TIPO,TIPOS_LICENCIA } = require('../utils/type');
const configService = require('../config/serverLicencia');
const dataService = require('./dataService');
const horasService = require('../services/horasService');
class LicenciasService {
  convertirDecimalAHora(decimal) {
    const esNegativo = decimal < 0;
    const valorAbsoluto = Math.abs(decimal);
    const horas = Math.floor(valorAbsoluto);
    const minutos = Math.round((valorAbsoluto - horas) * 60);

    const horasFormato = `${esNegativo ? '-' : ''}${String(horas).padStart(2, '0')}`;
    const minutosFormato = `${String(minutos).padStart(2, '0')}`;

    return `${horasFormato}:${minutosFormato}`;
  }
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
      const fechaActual = new Date().toISOString().split('T')[0];
      const fechaInicioFormat = new Date(fechaInicio).toISOString().split('T')[0];
      if (fechaInicioFormat === fechaActual) {
        console.log(`🟢 La fecha de inicio (${fechaInicioFormat}) coincide con la fecha actual (${fechaActual}). Actualizando Personal...`);
        await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('tipo', sql.VarChar, tipo)
          .query(QUERIES.actualizarTipoPersonal);
        console.log(`✅ Actualizado Personal: operador ${operadorId} ahora es de tipo ${tipo}`);
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
  
  async eliminarLicencia(operadorId, licenciaId, oldCantidad, usoId) {
    const pool = await getConnection();
    try {
      console.log("Iniciando eliminación de licencia...");
      console.log("Datos recibidos:", { operadorId, licenciaId, oldCantidad, usoId });
  
      // Restar la oldCantidad en UsoLicencias antes de eliminar la licencia
      console.log("Actualizando UsoLicencias, restando la cantidad antigua...");
      await pool.request()
        .input("usoId", sql.Int, usoId)
        .input("oldCantidad", sql.Int, oldCantidad)
        .query(`
          UPDATE UsoLicencias 
          SET totalUsado = totalUsado - @oldCantidad 
          WHERE id = @usoId
        `);
  
      // Eliminar el registro de la licencia
      console.log("Eliminando la licencia...");
      await pool.request()
        .input("licenciaId", sql.Int, licenciaId)
        .input("operadorId", sql.VarChar, operadorId)
        .query(`
          DELETE FROM Licencias 
          WHERE id = @licenciaId AND operadorId = @operadorId
        `);
  
      // Invalidar la caché para que los cambios se reflejen en el frontend
      dataService.invalidateOperadorCache(operadorId);
  
      console.log("Licencia eliminada exitosamente.");
      return { success: true, mensaje: "Licencia eliminada correctamente" };
    } catch (error) {
      console.error("Error al eliminar licencia:", error);
      return { error: "Error al eliminar la licencia", status: 500 };
    }
  }
  
  
  async obtenerLicenciasPorAnios(personalId) {
    const pool = await getConnection();
    try {
      if (!personalId || isNaN(personalId)) {
        // Lanza error en lugar de usar res.status(...).json(...)
        throw new Error(`El ID de personal '${personalId}' no es válido`);
      }
  
      const query = `
        SELECT TOP 3 id, anio, diasLicenciaAsignados
        FROM LicenciaporAnios
        WHERE personalId = @personalId
        ORDER BY anio DESC;
      `;
  
      const result = await pool.request()
        .input('personalId', sql.Int, personalId)
        .query(query);
  
      if (result.recordset.length === 0) {
        throw new Error(`No se encontraron registros de licencia para el personal con ID ${personalId}`);
      }
  
      return result.recordset;
    } catch (error) {
      console.error('Error en obtenerLicenciasPorAnios:', error);
      throw error;
    }
  }
  
  async getResumenLicencias(operadorId) {
    const hoy = new Date();
    const currentYear = hoy.getFullYear();

  
    try {
      const historialData = await dataService.loadHistorialLicencias(operadorId, currentYear);

      if (!historialData || historialData.length === 0) {
        return { mensaje: "No hay Licencias para mostrar" };
      }
    
      
      const personalData = historialData.length > 0 ? historialData[0].personal : {};
      //console.log('Datos de personal extraídos:', personalData);
      const licenciaporAnios = personalData.licenciaporAnios;
      const condicionLaboral = personalData.condicionLaboral || '';
      const sexo = historialData.length > 0 ? historialData[0].operador.sexo : '';     
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
        ? personalData.licenciaporAnios  // Contiene objetos con { anio, diasLicenciaAsignados }
        : [{ anio: currentYear }];

 const usoAnual = await Promise.all(
          años.map(async (item) => {
            const anio = item.anio;
            const registroUso = historialData.find(r =>
              r.usoLicencia && r.usoLicencia.some(u =>
                u.usoLicenciaTipo === tipo && u.usoLicenciaAnio === anio
              )
            );

            const usoRecord = registroUso 
              ? registroUso.usoLicencia.find(u => u.usoLicenciaTipo === tipo && u.usoLicenciaAnio === anio) 
              : null;

            const usado = usoRecord ? usoRecord.totalUsado : 0;
            let total;

if (tipo === 'Licencia') {
  total = item.diasLicenciaAsignados;
} else if (tipo === 'Parte_Medico') {
  total = null;
} else if (tipo === 'Profilactica') {
  if (!(condicionLaboral === 'Medico' || condicionLaboral === 'Comisionado')) {
    return null; // Excluir del resumen
  }
  total = DIAS_POR_TIPO[tipo] || 0;
} else if (tipo === 'Articulo') {
  if (condicionLaboral === 'Planta_Permanente' || condicionLaboral === 'Comisionado') {
    total = DIAS_POR_TIPO[tipo] || 0;
  } else {
    return null; // Excluir si no cumple la condición
  }
} else {
  total = DIAS_POR_TIPO[tipo] || 0;
}

            // Calcular disponible
            const disponible = total !== null ? Math.max(0, total - usado) : null;

            //console.log(`Tipo: ${tipo}, Año: ${anio}, Usado: ${usado}, Total: ${total}, Disponible: ${disponible}`);
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
            id: lic.licencia.id,
            fechaInicio: lic.licencia.fechaInicio ? new Date(lic.licencia.fechaInicio).toISOString().split('T')[0] : null,
            fechaFin: lic.licencia.fechaFin ? new Date(lic.licencia.fechaFin).toISOString().split('T')[0] : null,
            cantidad: lic.licencia.cantidad,
            tipo: lic.licencia.tipo,
            estado: lic.licencia.estado,
            anio: lic.licencia.anio,
            createdAt: lic.licencia.createdAt ? new Date(lic.licencia.createdAt).toISOString() : null,
            updatedAt: lic.licencia.updatedAt ? new Date(lic.licencia.updatedAt).toISOString() : null        
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
        diasLicenciaAnuales: licenciaporAnios[0].diasLicenciaAsignados
      };
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      throw error;
    }
  }
  


  async obtenerResumenGeneral() {
    const pool = await getConnection();
    try {
      // Obtener cantidad de operadores
      const queryOperadores = `
        SELECT COUNT(*) AS cantidadOperadores
        FROM Operador;
      `;
      const resultOperadores = await pool.request().query(queryOperadores);
      const cantidadOperadores = resultOperadores.recordset[0].cantidadOperadores;
  
      // Obtener cantidad de licencias activas
      const queryLicenciasActivas = `
        SELECT COUNT(*) AS cantidadLicenciasActivas
        FROM Licencias
        WHERE fechaInicio <= GETDATE() 
          AND fechaFin >= GETDATE();
      `;
      const resultLicencias = await pool.request().query(queryLicenciasActivas);
      const cantidadLicenciasActivas = resultLicencias.recordset[0].cantidadLicenciasActivas;
  
      // Sumar horas extra negativas (convertidas en positivo)
      const queryHorasExtraNegativas = `
        SELECT SUM(ABS(horasExtra)) AS totalHorasExtraNegativas
        FROM HorasTrabajadas
        WHERE horasExtra < 0;
      `;
      const resultHorasExtra = await pool.request().query(queryHorasExtraNegativas);
      const totalHorasExtraNegativas = resultHorasExtra.recordset[0].totalHorasExtraNegativas || 0;
      const totalHorasExtraNegativasFormato = this.convertirDecimalAHora(totalHorasExtraNegativas);
      
      return {
        cantidadOperadores,
        cantidadLicenciasActivas,
        totalHorasExtraNegativas: totalHorasExtraNegativasFormato
      };
    } catch (error) {
      console.error("Error en obtenerResumenGeneral:", error);
      throw error;
    }
  }
  
  
}

module.exports = new LicenciasService();