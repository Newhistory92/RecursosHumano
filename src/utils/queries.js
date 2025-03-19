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
SELECT 
  l.id AS licenciaId,
  l.fechaInicio,
  l.fechaFin,
  l.tipo,
  l.cantidad,
  l.estado,
  l.anio AS licenciaAnio,
  l.createdAt AS licenciaCreatedAt,
  l.updatedAt AS licenciaUpdatedAt,
  o.sexo,
  p.condicionLaboral,
  p.fechaInicioPlanta,

  -- UsoLicencias en formato JSON correcto
  (
    SELECT 
      '[' + STUFF(( 
        SELECT 
          ',' + 
          '{"usoLicenciaId":' + CAST(u.id AS VARCHAR) +
          ',"totalUsado":' + CAST(u.totalUsado AS VARCHAR) +
          ',"usoLicenciaTipo":"' + u.tipo + '"' +
          ',"usoLicenciaAnio":' + CAST(u.anio AS VARCHAR) +
          ',"usoLicenciaCreatedAt":"' + CONVERT(VARCHAR, u.createdAt, 120) + '"' +
          ',"usoLicenciaUpdatedAt":"' + CONVERT(VARCHAR, u.updatedAt, 120) + '"}'
        FROM UsoLicencias u
        WHERE u.operadorId = o.id
          AND u.anio >= YEAR(GETDATE()) - 2
        FOR XML PATH ('')
      ), 1, 1, '') + ']' 
  ) AS UsoLicenciasRecords,

  -- LicenciaporAnios en formato JSON correcto
  (
    SELECT 
      '[' + STUFF(( 
        SELECT 
          ',' + 
          '{"licenciaAnioAsignado":' + CAST(la.anio AS VARCHAR) +
          ',"diasLicenciaAsignados":' + CAST(la.diasLicenciaAsignados AS VARCHAR) +
          ',"licenciaPorAniosCreatedAt":"' + CONVERT(VARCHAR, la.createdAt, 120) + '"' +
          ',"licenciaPorAniosUpdatedAt":"' + CONVERT(VARCHAR, la.updatedAt, 120) + '"}'
        FROM LicenciaporAnios la
        WHERE la.personalId = p.id
          AND la.anio >= YEAR(GETDATE()) - 2
        FOR XML PATH ('')
      ), 1, 1, '') + ']' 
  ) AS LicenciaporAniosRecords

FROM Operador o
LEFT JOIN Personal p ON o.id = p.operadorId
LEFT JOIN Licencias l ON l.operadorId = o.id AND l.anio >= YEAR(GETDATE()) - 2
WHERE o.id = @operadorId
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
    SELECT TOP 4 L.operadorId, L.tipo, L.fechaInicio, L.fechaFin
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
