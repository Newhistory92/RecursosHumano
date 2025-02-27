const QUERIES = {
  getPersonalInfo: `
    SELECT p.*, c.*
    FROM Personal p
    LEFT JOIN ConfigPersonal c ON p.condicionLaboral = c.condicionLaboral
    WHERE p.operadorId = @operadorId
  `,

  getOperadorById: `
 SELECT sexo
FROM Operador
WHERE id = @operadorId

  `,

  getConfigPersonal: `
    SELECT *
    FROM ConfigPersonal
    WHERE condicionLaboral = @condicionLaboral
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

//
  getHistorialLicencias: `
    SELECT 
      id,
      fechaInicio,
      fechaFin,
      cantidad,
      estado,
      anio,
      createdAt,
      updatedAt
    FROM Licencias
    WHERE operadorId = @operadorId
      AND tipo = @tipo
      AND anio >= @anioActual - 2
    ORDER BY fechaInicio DESC
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
