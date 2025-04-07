
const { getConnection, getConnectionDB2 } = require('../config/configbd');
const sql = require('mssql');

const metricAfiliados = {
    async getAfiliadosMetrics() {
        let poolDB2, pool;
        try {
          [poolDB2, pool] = await Promise.all([getConnectionDB2(), getConnection()]);
    
          const afiliadosData = await this.getInstitutionalMetrics(poolDB2);
          const paginaData = await this.getPageMetrics(pool);
    
          return {
            Afiliados: {
              totalPagina: paginaData.afiliados.totalPagina,
              totalOSP: afiliadosData.afiliados.totalOSP
            },
            sexo: afiliadosData.sexo,
            localidad: paginaData.localidad,
            tasaCrecimiento: afiliadosData.tasaCrecimiento,
            tasaCrecimientoAnual: afiliadosData.tasaCrecimientoAnual,
            activosPasivos: afiliadosData.activosPasivos,
  
          };
        } catch (error) {
          console.error('Error obteniendo métricas de afiliados:', error);
          throw error;
        } 
      
    },

      async getInstitutionalMetrics(poolDB2) {
        const afiliadosQuery = `
          SELECT Sexo, barra, FecAlt
          FROM ObraSocial.dbo.Afiliados
          WHERE (CodBaja = '' OR CodBaja IS NULL)
            AND fechabaja = '1900-01-01 00:00:00'
            AND (NumTarjeta <> '' AND NumTarjeta IS NOT NULL)
        `;

        const bajasQuery = `
        SELECT NumTarjeta, fechabaja, CodBaja 
        FROM ObraSocial.dbo.Afiliados
        WHERE CodBaja <> '' 
          AND fechabaja <> '1900-01-01 00:00:00'
         AND (NumTarjeta <> '' AND NumTarjeta IS NOT NULL)
          AND YEAR(fechabaja) >= YEAR(GETDATE()) - 4
      `;
    
      const [afiliadosResult, bajasResult] = await Promise.all([
        poolDB2.request().query(afiliadosQuery),
        poolDB2.request().query(bajasQuery)
    ]);
        const afiliados = afiliadosResult.recordset;
        const bajas = bajasResult.recordset;
        const totalOSP = afiliados.length;

        
        const sexoCount = {
          Masculino: afiliados.filter(a => a.Sexo === '001').length,
          Femenino: afiliados.filter(a => a.Sexo === '002').length
        };
    
        const activos = afiliados.filter(a => a.barra !== '060').length;
        const pasivos = totalOSP - activos;
    
        const motivosBaja = await this.obtenerMotivosBaja(poolDB2, bajas);
        const { monthlyGrowth, yearlyGrowth } = this.calculateGrowthRates(
            afiliados, 
            bajas,
            motivosBaja
        );

        return {
          afiliados: { totalOSP },
          sexo: Object.entries(sexoCount).map(([name, value]) => ({ name, value })),
          activosPasivos: [
            { name: "Activos", value: activos },
            { name: "Pasivos", value: pasivos }
          ],
          tasaCrecimiento: monthlyGrowth,
          tasaCrecimientoAnual: yearlyGrowth,
        };
        
      },
    
      async getPageMetrics(pool) {
        const afiliadosQuery = await pool.request().query(`
          SELECT address 
          FROM Afiliado 
          WHERE role = 'USER'
        `);
        const afiliadosPagina = afiliadosQuery.recordset;
        const totalPagina = afiliadosPagina.length;
    
        const localidadCount = {};
    
        afiliadosPagina.forEach(a => {
          if (a.address) {
            const parts = a.address.split(',');
            if (parts.length > 1) {
              const departamento = parts[1].trim();
              localidadCount[departamento] = (localidadCount[departamento] || 0) + 1;
            }
          }
        });
    
    
        return {
          afiliados: { totalPagina },
          localidad: Object.entries(localidadCount).map(([name, value]) => ({ name, value }))
        };
      },

      async obtenerMotivosBaja(poolDB2, bajas) {
        const motivos = {};
        const codigosUnicos = [...new Set(bajas.map(b => b.CodBaja).filter(Boolean))];
        
        for (const codigo of codigosUnicos) {
            try {
                const result = await poolDB2.request()
                    .input('codigoBaja', sql.VarChar(50), codigo)
                    .query('SELECT nombre FROM migrada.dbo.bajas WHERE codigo = @codigoBaja');
                
                    const nombreMotivo = result.recordset[0]?.nombre?.trim() || `Código ${codigo}`;
                    motivos[codigo] = nombreMotivo;
            } catch (error) {
                console.error(`Error al obtener motivo para código ${codigo}:`, error);
                motivos[codigo] = `Código ${codigo}`;
            }    
        }    
        
        return motivos;
    },    
    calculateGrowthRates(afiliados, bajas, motivosBaja) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

        // Inicializar estructuras de datos
        const monthlyData = [];
        const yearlyData = {};
        let acumulativoMensual = 0;
        let acumulativoAnual = 0;

        // Inicializar meses
        for (let i = 0; i < 12; i++) {
            const date = new Date(currentYear, currentMonth - i, 1);
            const monthKey = monthNames[date.getMonth()];
            const year = date.getFullYear();

            monthlyData.unshift({
                mes: monthKey,
                year: year,
                afiliados: 0,
                bajas: 0,
                balance: 0,
                acumulativoTotal: 0,
                BajaMotivos: [],
                sortKey: year * 100 + date.getMonth()
            });
        }

        // Inicializar años
        for (let year = currentYear - 4; year <= currentYear; year++) {
            yearlyData[year] = { 
                afiliados: 0, 
                bajas: 0, 
                balance: 0, 
                acumulativoTotal: 0,
                BajaMotivos: []
            };
        }

        // Procesar afiliados
        afiliados.forEach(a => {
            if (a.FecAlt) {
                const fechaAlt = new Date(a.FecAlt);
                if (isNaN(fechaAlt.getTime())) return;

                const afiliacionYear = fechaAlt.getFullYear();
                const afiliacionMonth = fechaAlt.getMonth();

                if (afiliacionYear >= currentYear - 4) {
                    const monthEntry = monthlyData.find(m => 
                        m.mes === monthNames[afiliacionMonth] && 
                        m.year === afiliacionYear
                    );

                    if (monthEntry) {
                        monthEntry.afiliados++;
                    }

                    if (yearlyData[afiliacionYear]) {
                        yearlyData[afiliacionYear].afiliados++;
                    }
                }
            }
        });

        // Procesar bajas con motivos ya obtenidos
        bajas.forEach(b => {
            if (b.fechabaja && b.CodBaja) {
                const fechaBaja = new Date(b.fechabaja);
                if (isNaN(fechaBaja.getTime())) return;

                const bajaYear = fechaBaja.getFullYear();
                const bajaMonth = fechaBaja.getMonth();
                const motivoNombre = motivosBaja[b.CodBaja] || `Código ${b.CodBaja}`;

                if (bajaYear >= currentYear - 4) {
                    // Para monthlyData
                    const monthEntry = monthlyData.find(m => 
                        m.mes === monthNames[bajaMonth] && 
                        m.year === bajaYear
                    );

                    if (monthEntry) {
                        monthEntry.bajas++;
                        const motivoExistente = monthEntry.BajaMotivos.find(m => m.name === motivoNombre);
                        if (motivoExistente) {
                            motivoExistente.value++;
                        } else {
                            monthEntry.BajaMotivos.push({ name: motivoNombre, value: 1 });
                        }
                    }

                    // Para yearlyData
                    if (yearlyData[bajaYear]) {
                        yearlyData[bajaYear].bajas++;
                        const motivoExistente = yearlyData[bajaYear].BajaMotivos.find(m => m.name === motivoNombre);
                        if (motivoExistente) {
                            motivoExistente.value++;
                        } else {
                            yearlyData[bajaYear].BajaMotivos.push({ name: motivoNombre, value: 1 });
                        }
                    }
                }
            }
        });

        // Calcular balances y acumulativos
        monthlyData.forEach(m => {
            m.balance = m.afiliados - m.bajas;
            acumulativoMensual += m.afiliados;
            m.acumulativoTotal = acumulativoMensual;
            m.BajaMotivos.sort((a, b) => b.value - a.value);
        });

        Object.values(yearlyData).forEach(y => {
            y.balance = y.afiliados - y.bajas;
            acumulativoAnual += y.afiliados;
            y.acumulativoTotal = acumulativoAnual;
            y.BajaMotivos.sort((a, b) => b.value - a.value);
        });

        // Ordenar y formatear resultados
        monthlyData.sort((a, b) => a.sortKey - b.sortKey);

        const yearlyGrowth = Object.entries(yearlyData)
            .map(([year, data]) => ({ 
                year: parseInt(year),
                afiliados: data.afiliados,
                bajas: data.bajas,
                balance: data.balance,
                acumulativoTotal: data.acumulativoTotal,
                BajaMotivos: data.BajaMotivos
            }))
            .sort((a, b) => a.year - b.year);

        return {
            monthlyGrowth: monthlyData.map(({ mes, afiliados, bajas, balance, acumulativoTotal, BajaMotivos }) => ({
                mes, afiliados, bajas, balance, acumulativoTotal, BajaMotivos
            })),
            yearlyGrowth
        };
    },

    // calculateGrowthRates(afiliados, bajas) {
    //     const now = new Date();    
    //     const currentYear = now.getFullYear();
    //     const currentMonth = now.getMonth();
    
    //     // Meses en español (abreviados)
    //     const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    
    //     // 1. Preparar estructura para los últimos 12 meses
    //     const monthlyData = [];
    //     let acumulativoMensual = 0;
    
    //     // Crear los 12 meses anteriores (incluyendo el actual)
    //     for (let i = 0; i < 12; i++) {
    //         const date = new Date(currentYear, currentMonth - i, 1);    
    //         const monthKey = monthNames[date.getMonth()];
    //         const year = date.getFullYear();
    
    //         monthlyData.unshift({
    //             mes: monthKey,    
    //             year: year, // Añadimos el año para filtrar correctamente
    //             afiliados: 0,
    //             bajas: 0,
    //             balance: 0,
    //             acumulativoTotal: 0,
    //             sortKey: year * 100 + date.getMonth()
    //         });
    //     }
    
    //     // 2. Preparar estructura para los últimos 5 años
    //     const yearlyData = {};
    //     let acumulativoAnual = 0;
    
    //     for (let year = currentYear - 4; year <= currentYear; year++) {
    //         yearlyData[year] = { 
    //             afiliados: 0,     
    //             bajas: 0, 
    //             balance: 0, 
    //             acumulativoTotal: 0 
    //         };
    //     }
    
    //     // 3. Procesar AFILIADOS (últimos 5 años)
    //     afiliados.forEach(a => {
    //         if (a.FecAlt) {
    //             const fechaAlt = new Date(a.FecAlt);    
    //             if (isNaN(fechaAlt.getTime())) return;
    
    //             const afiliacionYear = fechaAlt.getFullYear();
    //             const afiliacionMonth = fechaAlt.getMonth();
    //             const monthKey = monthNames[afiliacionMonth];
    
    //             // Filtrar solo últimos 5 años
    //             if (afiliacionYear >= currentYear - 4) {
    //                 // Buscar el mes EXACTO (mes + año) en monthlyData    
    //                 const monthEntry = monthlyData.find(m => 
    //                     m.mes === monthKey &&     
    //                     m.year === afiliacionYear
    //                 );
    
    //                 if (monthEntry) {
    //                     monthEntry.afiliados++;    
    //                 }
    
    //                 // Contar en el año correspondiente
    //                 if (yearlyData[afiliacionYear]) {
    //                     yearlyData[afiliacionYear].afiliados++;    
    //                 }
    //             }
    //         }
    //     });
    
    //     // 4. Procesar BAJAS (últimos 5 años)
    //     bajas.forEach(b => {
    //         if (b.fechabaja) {
    //             const fechaBaja = new Date(b.fechabaja);    
    //             if (isNaN(fechaBaja.getTime())) return;
    
    //             const bajaYear = fechaBaja.getFullYear();
    //             const bajaMonth = fechaBaja.getMonth();
    //             const monthKey = monthNames[bajaMonth];
    
    //             // Filtrar solo últimos 5 años
    //             if (bajaYear >= currentYear - 4) {
    //                 // Buscar el mes EXACTO (mes + año) en monthlyData    
    //                 const monthEntry = monthlyData.find(m => 
    //                     m.mes === monthKey &&     
    //                     m.year === bajaYear
    //                 );
    
    //                 if (monthEntry) {
    //                     monthEntry.bajas++;    
    //                 }
    
    //                 // Contar en el año correspondiente
    //                 if (yearlyData[bajaYear]) {
    //                     yearlyData[bajaYear].bajas++;    
    //                 }
    //             }
    //         }
    //     });
    
    //     // 5. Calcular balances y acumulativos
    //     // Mensual
    //     monthlyData.forEach(m => {
    //         m.balance = m.afiliados - m.bajas;    
    //         acumulativoMensual += m.afiliados;
    //         m.acumulativoTotal = acumulativoMensual;
    //     });
    
    //     // Anual
    //     Object.values(yearlyData).forEach(y => {
    //         y.balance = y.afiliados - y.bajas;    
    //         acumulativoAnual += y.afiliados;
    //         y.acumulativoTotal = acumulativoAnual;
    //     });
    
    //     // 6. Ordenar y formatear resultados
    //     monthlyData.sort((a, b) => a.sortKey - b.sortKey);
    
    //     const yearlyGrowth = Object.entries(yearlyData)
    //         .map(([year, data]) => ({ 
    //             year: parseInt(year),     
    //             ...data 
    //         }))
    //         .sort((a, b) => a.year - b.year);
    
    //     return {
    //         monthlyGrowth: monthlyData.map(({ mes, afiliados, bajas, balance, acumulativoTotal }) => ({
    //             mes, afiliados, bajas, balance, acumulativoTotal    
    //         })),
    //         yearlyGrowth: yearlyGrowth
    //     };
    // }
   
    


}
  
  module.exports = metricAfiliados;