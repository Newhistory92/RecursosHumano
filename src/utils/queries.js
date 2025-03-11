const QUERIES = {
  getPersonalInfo: `
SELECT p.fechaInicioPlanta, p.condicionLaboral, p.fechaInicioTrabj,p.id
FROM Personal p
WHERE p.operadorId = @operadorId

  `,

  getOperadorById: `
 SELECT sexo
FROM Operador
WHERE id = @operadorId

  `,

 

  getOperadores: `
    SELECT DISTINCT o.id
    FROM Operador o
    JOIN Personal p ON o.id = p.operadorId
  `,

  getUsoLicencias: `
  SELECT totalUsado 
  FROM UsoLicencias
  WHERE operadorId = @operadorId AND tipo = @tipo AND anio = @anio
`,
updateTotalUsado: `
  UPDATE UsoLicencias 
  SET totalUsado = @totalUsado, updatedAt = GETDATE()
  WHERE operadorId = @operadorId AND tipo = @tipo AND anio = @anio
`,
insertTotalUsado: `
  INSERT INTO UsoLicencias (operadorId, tipo, anio, totalUsado, updatedAt)
  VALUES (@operadorId, @tipo, @anio, @totalUsado, GETDATE())
`,

  insertLicencia: `
       INSERT INTO Licencias (
  operadorId, fechaInicio, fechaFin, cantidad, tipo, estado, anio, updatedAt
)
OUTPUT INSERTED.id
VALUES (
  @operadorId, @fechaInicio, @fechaFin, @cantidad, @tipo, 'Aprobado', @anio, GETDATE()
)`,

updateLicencia: `
        UPDATE Licencias
        SET 
          fechaInicio = @fechaInicio,
          fechaFin = @fechaFin,
          cantidad = @cantidad,
          tipo = @tipo,
          updatedAt = @updatedAt
        OUTPUT 
          INSERTED.id,
          INSERTED.operadorId,
          INSERTED.fechaInicio,
          INSERTED.fechaFin,
          INSERTED.cantidad,
          INSERTED.tipo
        WHERE id = @id AND operadorId = @operadorId
      `,
//
  getHistorialLicencias: `
      WITH UsoLicenciasOrdered AS ( 
  SELECT 
    u.*,
    ROW_NUMBER() OVER (
      PARTITION BY u.operadorId, u.anio, u.tipo 
      ORDER BY u.createdAt DESC
    ) AS rn
  FROM UsoLicencias u
)
SELECT 
  l.id AS licenciaId,
  l.fechaInicio,
  l.fechaFin,
  l.tipo,
  l.cantidad,
  l.estado,
  l.anio,
  l.createdAt AS licenciaCreatedAt,
  l.updatedAt AS licenciaUpdatedAt,
  o.sexo,
  uo.id AS usoLicenciaId,
  uo.totalUsado,
  uo.tipo AS usoLicenciaTipo,
  uo.anio AS usoLicenciaAnio,
  uo.updatedAt AS usoLicenciaUpdatedAt,
  uo.createdAt AS usoLicenciaCreatedAt,
  la.diasLicenciaAsignados, -- Se obtiene de LicenciaporAnios
  la.anio AS licenciaAnioAsignado, -- Asegura que se ve el año correcto
  p.condicionLaboral,
  p.fechaInicioPlanta
FROM Licencias l
JOIN Operador o ON l.operadorId = o.id
JOIN Personal p ON l.operadorId = p.operadorId
LEFT JOIN UsoLicenciasOrdered uo 
  ON l.operadorId = uo.operadorId 
  AND l.anio = uo.anio 
  AND l.tipo = uo.tipo
  AND uo.rn = 1
LEFT JOIN LicenciaporAnios la
  ON p.id = la.personalId
  AND l.anio = la.anio
WHERE l.operadorId = @operadorId
  AND l.anio >= @anioActual - 2
ORDER BY l.fechaInicio DESC;


        `,


  updateDiasAsignados: `
     UPDATE Personal
          SET diasLicenciaAsignados = @diasLicenciaAsignados,
              updatedAt = GETDATE()
          WHERE operadorId = @operadorId
  `,

  mergeUsoLicencias: `
    MERGE INTO UsoLicencias AS target
    USING (VALUES (@operadorId, @tipo, @anio, @totalUsado)) 
      AS source (operadorId, tipo, anio, totalUsado)
    ON target.operadorId = source.operadorId 
      AND target.tipo = source.tipo 
      AND target.anio = source.anio
    WHEN MATCHED THEN
      UPDATE SET 
        totalUsado = source.totalUsado,
        updatedAt = GETDATE()
    WHEN NOT MATCHED THEN
      INSERT (operadorId, tipo, anio, totalUsado, updatedAt)
      VALUES (
        source.operadorId, 
        source.tipo, 
        source.anio, 
        source.totalUsado,
        GETDATE()
      );
  `,

  getLicenciasDelAño: `
    SELECT cantidad 
    FROM Licencias 
    WHERE operadorId = @operadorId 
    AND YEAR(anio) = @año 
    AND tipo = @tipo
  `,

  getLicenciasActivas: `
    SELECT TOP 8 L.operadorId, L.tipo, L.fechaInicio, L.fechaFin
    FROM Licencias L
    WHERE L.estado = 'Aprobado'
    ORDER BY L.createdAt DESC
  `,

  actualizarTipoPersonal: `
    UPDATE Personal
    SET tipo = @tipo,
        updatedAt = GETDATE()
    WHERE operadorId = @operadorId
  `,

  reactivarPersonal: `
    UPDATE Personal
    SET tipo = 'Activo',
        updatedAt = GETDATE()
    WHERE operadorId = @operadorId
  `,

  crearTablaHorasTrabajadas: `
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[registrarHorasTrabajadas]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[registrarHorasTrabajadas](
        [id] [int] IDENTITY(1,1) PRIMARY KEY,
        [idReloj] [varchar](50) NOT NULL,
        [fecha] [date] NOT NULL,
        [horaEntrada] [time](7) NULL,
        [horaSalida] [time](7) NULL,
        [createdAt] [datetime] NOT NULL DEFAULT GETDATE(),
        [updatedAt] [datetime] NOT NULL DEFAULT GETDATE()
      )

      CREATE INDEX [IX_registrarHorasTrabajadas_idReloj] ON [dbo].[registrarHorasTrabajadas]([idReloj])
      CREATE INDEX [IX_registrarHorasTrabajadas_fecha] ON [dbo].[registrarHorasTrabajadas]([fecha])
    END
  `
};

module.exports = { QUERIES };
