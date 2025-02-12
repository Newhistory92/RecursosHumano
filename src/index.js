const express = require('express');
const sql = require('mssql');
const cron = require('node-cron');
const { dbConfig }  = require('./config/configbd');

const app = express();
const port = 3008;

// Conectar a SQL Server
async function connectToDatabase() {
    try {
        await sql.connect(dbConfig);
        console.log('Conectado a SQL Server');
    } catch (err) {
        console.error('Error al conectar a SQL Server:', err);
    }
}

// Función para realizar cálculos
async function calcularRecursosHumanos() {
    try {
        const request = new sql.Request();

        // Ejemplo: Calcular horas extra
        const horasExtraQuery = `
            SELECT EmpleadoID, SUM(HorasExtra) AS TotalHorasExtra
            FROM RegistroHoras
            WHERE Fecha >= DATEADD(DAY, -1, GETDATE())
            GROUP BY EmpleadoID
        `;
        const horasExtraResult = await request.query(horasExtraQuery);
        console.log('Horas Extra:', horasExtraResult.recordset);

        // Ejemplo: Calcular ausentes
        const ausentesQuery = `
            SELECT COUNT(*) AS TotalAusentes
            FROM RegistroAsistencia
            WHERE Fecha = CONVERT(date, GETDATE()) AND Asistio = 0
        `;
        const ausentesResult = await request.query(ausentesQuery);
        console.log('Ausentes:', ausentesResult.recordset);

        // Aquí puedes agregar más consultas para otros cálculos

    } catch (err) {
        console.error('Error al realizar cálculos:', err);
    }
}

// Programar la tarea cada 30 minutos
cron.schedule('*/30 * * * *', () => {
    console.log('Ejecutando cálculos de recursos humanos...');
    calcularRecursosHumanos();
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Microservicio escuchando en http://localhost:${port}`);
    connectToDatabase();
});