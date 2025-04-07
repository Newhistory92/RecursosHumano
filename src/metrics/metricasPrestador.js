const { getConnection, getConnectionDB2 } = require('../config/configbd');



const getPrestadorMetrics = async (req, res) => {
    try {
        const db2 = await getConnectionDB2();
        const db = await getConnection();

        // 1️⃣ Obtener el total de prestadores activos en la BD de la institución
        const prestadoresOSP = await db2.request().query(`
            SELECT Especialidad, esp1, esp2, Localidad, Fidelizado 
            FROM ObraSocial.dbo.Prestadores
            WHERE Anulada = 0 
            AND Fecha_Baja = Convert(nchar, '19000101')
        `);

        const totalOSP = prestadoresOSP.recordset.length;

        // 2️⃣ Obtener las especialidades médicas
        const especialidadesDB = await db2.request().query(`
            SELECT codigo, nombre FROM ObraSocial.dbo.Especialidades_Medicas
        `);

        const especialidadesMap = new Map();
        especialidadesDB.recordset.forEach(({ codigo, nombre }) => {
            especialidadesMap.set(codigo.trim(), nombre.trim()); // 🟢 Limpiar espacios
        });

        // 3️⃣ Contar prestadores por especialidad, localidad y fidelización
        const especialidadMap = new Map();
        const localidadMap = new Map();
        let fidelizados = { Fidelizado: 0, No_Fidelizado: 0 };

        prestadoresOSP.recordset.forEach(({ Especialidad, esp1, esp2, Localidad, Fidelizado }) => {
            // 🔹 Limpiar espacios en los códigos
            Especialidad = Especialidad.trim();
            esp1 = esp1.trim();
            esp2 = esp2.trim();
            Localidad = Localidad.trim();

            // ✅ Contar especialidades (ignorando vacíos)
            [Especialidad, esp1, esp2].forEach((codigo) => {
                if (codigo && especialidadesMap.has(codigo)) {
                    const nombre = especialidadesMap.get(codigo);
                    especialidadMap.set(nombre, (especialidadMap.get(nombre) || 0) + 1);
                }
            });

            // ✅ Contar localidades (ignorando vacíos)
            if (Localidad) {
                localidadMap.set(Localidad, (localidadMap.get(Localidad) || 0) + 1);
            }

            // ✅ Contar fidelizados (ahora correctamente)
            if (Fidelizado === "1") {
                fidelizados.Fidelizado++;
            } else if (Fidelizado === "0") {
                fidelizados.No_Fidelizado++;
            }
        });

        // 4️⃣ Obtener prestadores en la BD de la página con rol EMPLOYEE
        const prestadoresPagina = await db.request().query(`
            SELECT * FROM paginaobrasocial.dbo.Prestador WHERE role = 'EMPLOYEE'
        `);

        const totalPagina = prestadoresPagina.recordset.length;

        // 5️⃣ Formatear la respuesta
        const especialidadesFinal = [];
        const especialidadesOtros = [];


        especialidadMap.forEach((value, name) => {
            if (value >= 10) {
                especialidadesFinal.push({ name, value });
            } else {
                especialidadesOtros.push({ name, value });
            }
        });
        
        if (especialidadesOtros.length > 0) {
            especialidadesFinal.push({ Otras: especialidadesOtros });
        }
        const response = {
            Prestador: {
                totalPagina,
                totalOSP
            },
            Fidelizados: [
                { Fidelizado: fidelizados.Fidelizado },
                { No_Fidelizado: fidelizados.No_Fidelizado }
            ],
            Localidad: Array.from(localidadMap, ([name, value]) => ({ name, value }))
                .filter(({ value }) => value >= 10),
             Especialidad: especialidadesFinal
        };

        return res.json(response);
    } catch (error) {
        console.error("❌ Error en getPrestadorMetrics:", error);
        return res.status(500).json({ message: "Error al obtener métricas de prestadores" });
    }
};

module.exports = { getPrestadorMetrics };


