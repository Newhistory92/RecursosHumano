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

  getTotalUsado: `
    SELECT COALESCE(SUM(cantidad), 0) as totalUsado
    FROM Licencias
    WHERE operadorId = @operadorId
    AND tipo = @tipo
    AND anio = @anio
     AND estado = 'Aprobado'
  `,
 // AND estado = 'APROBADA'

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
  `
};

module.exports = { QUERIES };
