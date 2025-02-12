const sql = require("mssql")
const { dbConfig } = require('../config/configbd');

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