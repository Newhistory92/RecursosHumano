const sql = require("mssql")
const { dbConfig } = require("../config/configdb")



function calcularCantidadDias(fechaInicio, fechaFin) {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const diferenciaMs = fin - inicio;
    return Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24)); // Días de diferencia
}

async function calcularLicenciasAcumuladas(operadorId) {
    try {
        await sql.connect(dbConfig );

        // Obtener licencias de los últimos 3 años
        const query = `
            SELECT SUM(cantidad) AS totalLicencias
            FROM Personal
            WHERE operadorId = '${operadorId}' AND tipo = 'LICENCIA' AND fechaInicio >= DATEADD(YEAR, -3, GETDATE())
        `;
        const result = await sql.query(query);

        const totalLicencias = result.recordset[0]?.totalLicencias || 0;

        console.log(`Licencias acumuladas para el operador ${operadorId}: ${totalLicencias}`);
        return totalLicencias;
    } catch (err) {
        console.error('Error al calcular licencias acumuladas:', err);
    } finally {
        await sql.close();
    }
}



async function eliminarRegistrosAntiguos(operadorId) {
    try {
        await sql.connect(dbConfig );

        // Eliminar licencias de hace más de 4 años
        const query = `
            DELETE FROM Personal
            WHERE operadorId = '${operadorId}' AND tipo = 'LICENCIA' AND fechaInicio < DATEADD(YEAR, -4, GETDATE())
        `;
        await sql.query(query);

        console.log(`Registros antiguos eliminados para el operador ${operadorId}.`);
    } catch (err) {
        console.error('Error al eliminar registros antiguos:', err);
    } finally {
        await sql.close();
    }
}



async function agregarRegistroPersonal(operadorId, tipo, fechaInicio, fechaFin, cantidad = null) {
    try {
        await sql.connect(dbConfig );

        // Calcular la cantidad si no se proporciona
        if (!cantidad) {
            cantidad = calcularCantidadDias(fechaInicio, fechaFin);
        }

        const query = `
            INSERT INTO Personal (operadorId, tipo, fechaInicio, fechaFin, cantidad)
            VALUES ('${operadorId}', '${tipo}', '${fechaInicio}', '${fechaFin}', ${cantidad})
        `;
        await sql.query(query);

        console.log(`Registro agregado para el operador ${operadorId}.`);
    } catch (err) {
        console.error('Error al agregar registro:', err);
    } finally {
        await sql.close();
    }
}

async function reiniciarContadoresAnuales() {
    try {
        await sql.connect(dbConfig );

        // Reiniciar días particulares, partes médicos, etc.
        const query = `
            UPDATE Personal
            SET cantidad = 0
            WHERE tipo IN ('PARTICULAR', 'PARTE_MEDICO', 'MATRIMONIO', 'MATERNIDAD', 'PATERNIDAD')
              AND YEAR(fechaInicio) < YEAR(GETDATE())
        `;
        await sql.query(query);

        console.log('Contadores anuales reiniciados.');
    } catch (err) {
        console.error('Error al reiniciar contadores anuales:', err);
    } finally {
        await sql.close();
    }
}