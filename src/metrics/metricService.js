const sql = require('mssql');
const { getConnection } = require('../config/configbd');
const {HORAS_POR_CONDICION} = require('../utils/type');
class MetricService {

    constructor() {
        // objeto para almacenar feriados (en formato 'YYYY-MM-DD') agregar cada año este objeto
        this.feriados = [
            "2025-01-01", "2025-03-03", "2025-03-04", "2025-03-24", "2025-04-02",
            "2025-04-17", "2025-04-18", "2025-05-01", "2025-05-25", "2025-06-17",
            "2025-06-20", "2025-07-09", "2025-08-18", "2025-10-13", "2025-11-17",
            "2025-12-08", "2025-12-25", "2025-05-02", "2025-08-15", "2025-10-10"
          ];
    }          
      

  // Función para obtener quejas por departamento
  async getQuejasPorDepartamento() {
    try {
      const pool = await getConnection();
      // Query: Une las tablas Quejas, Operador y Personal para contar las quejas por departamento y por usuario
      const query = `
        SELECT 
          p.departamento,
          o.name AS nombreOperador,
          COUNT(q.id) AS cantidadQuejas
        FROM Quejas q
        JOIN Operador o ON q.operadorId = o.id
        JOIN Personal p ON o.id = p.operadorId
        GROUP BY p.departamento, o.name
      `;
      const result = await pool.request().query(query);
      
      // Agrupar por departamento
      const data = result.recordset.reduce((acc, curr) => {
        const dept = curr.departamento || 'Sin departamento';
        if (!acc[dept]) {
          acc[dept] = {
            departamento: dept,
            cantidad: 0,
            users: []
          };
        }
        acc[dept].cantidad += curr.cantidadQuejas;
        acc[dept].users.push({
          name: curr.nombreOperador,
          count: curr.cantidadQuejas
        });
        return acc;
      }, {});

      // Convertir el objeto a un array
      return Object.values(data);
    } catch (error) {
      console.error('Error en getQuejasPorDepartamento:', error);
      throw error;
    }
  }

  async getLicenciasPorTipo() {
    try {
      const pool = await getConnection();
      const query = `
        SELECT tipo, COUNT(id) AS cantidad
        FROM Licencias
        WHERE fechaInicio <= GETDATE() 
          AND fechaFin >= GETDATE()
        GROUP BY tipo;
      `;

      const result = await pool.request().query(query);


      // Convertir resultado a formato esperado
      const data = result.recordset.map(row => ({
          tipo: row.tipo,
          value: row.cantidad
        }));

      return data;
    } catch (error) {
      console.error('Error en getLicenciasPorTipo:', error);
      throw error;
    }
  }


   contarDiasHabiles(year, month) {
    let count = 0;
    const date = new Date(year, month - 1, 1); // month: 1-12
    while (date.getMonth() === month - 1) {
      const day = date.getDay();
      // 0: domingo, 6: sábado
      if (day !== 0 && day !== 6) {
        const dateString = date.toISOString().split('T')[0];
        // Verificar que no sea feriado (usando this.feriados)
        if (!this.feriados.includes(dateString)) {
          count++;
        }
      }
      date.setDate(date.getDate() + 1);
    }
    return count;
  }


  async obtenerResumenMensual(operadorId) {
    try {
      const pool = await getConnection();
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1; // getMonth() devuelve 0-indexado

      // Se obtiene la condición laboral del operador desde Personal
      const resultPersonal = await pool.request()
        .input('operadorId', sql.VarChar, operadorId)
        .query(`SELECT condicionLaboral FROM Personal WHERE operadorId = @operadorId`);
      if (resultPersonal.recordset.length === 0) {
        throw new Error('No se encontró el operador en Personal');
      }
      const condicionLaboral = resultPersonal.recordset[0].condicionLaboral;
      // Horas diarias esperadas, según la condición laboral (si no existe, se usa 8)
      const horasDiarias = HORAS_POR_CONDICION[condicionLaboral] || 8;
      
      // Definir los meses a considerar (por ejemplo, de Enero a Junio)
      const meses = [
       { nombre: "Ene", numero: 1 },
        { nombre: "Feb", numero: 2 },
        { nombre: "Mar", numero: 3 },
        { nombre: "Abr", numero: 4 },
        { nombre: "May", numero: 5 },
        { nombre: "Jun", numero: 6 },
        { nombre: "Jul", numero: 7 },
        { nombre: "Ago", numero: 8 },
        { nombre: "Sep", numero: 9 },
        { nombre: "Oct", numero: 10 },
        { nombre: "Nov", numero: 11 },
        { nombre: "Dic", numero: 12 }
      ];
      
      // Filtrar solo los meses que ya han transcurrido (mes <= currentMonth)
      const mesesTranscurridos = meses.filter(mes => mes.numero <= currentMonth);

      // Para cada mes, obtener la suma de las horas trabajadas y la cantidad de quejas
      const metricsData = await Promise.all(mesesTranscurridos.map(async (mes) => {
        // Calcular días hábiles del mes (excluyendo sábados, domingos )
        const diasHabiles = this.contarDiasHabiles(currentYear, mes.numero);
        const expectedHours = diasHabiles * horasDiarias;
        
        // Sumar las horas trabajadas del mes (RegistroHorasDiarias)
        const queryHoras = `
          SELECT COALESCE(SUM(horas), 0) AS totalHoras
          FROM RegistroHorasDiarias
          WHERE operadorId = @operadorId
            AND YEAR(createdAt) = @year
            AND MONTH(createdAt) = @month
        `;
        const resultHoras = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('year', sql.Int, currentYear)
          .input('month', sql.Int, mes.numero)
          .query(queryHoras);
        const hoursWorked = resultHoras.recordset[0].totalHoras;
  
        // Contar la cantidad de quejas en ese mes
        const queryQuejas = `
          SELECT COUNT(*) AS totalQuejas
          FROM Quejas
          WHERE operadorId = @operadorId
            AND YEAR(createdAt) = @year
            AND MONTH(createdAt) = @month
        `;
        const resultQuejas = await pool.request()
          .input('operadorId', sql.VarChar, operadorId)
          .input('year', sql.Int, currentYear)
          .input('month', sql.Int, mes.numero)
          .query(queryQuejas);
        const complaints = resultQuejas.recordset[0].totalQuejas;
  
        return {
          mes: mes.nombre,
          horasTrabajadas: hoursWorked,
          horasEsperadas: expectedHours,
          quejas: complaints
        };
      }));
  
      return { data: metricsData };
    } catch (error) {
      console.error('Error en obtenerResumenMensual:', error);
      throw error;
    }
  }
}

module.exports = new MetricService();
