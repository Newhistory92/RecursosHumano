const TIPOS_LICENCIA = [
    'Licencia', 'Parte_Medico', 'Profilactica', 'Particular',
    'Matrimonio', 'Matrimonio_Hijo', 'Paternidad', 'Paternidad_Especial',
    'Maternidad', 'Fallecimiento', 'Enfermedad', 'Guarda_Tenencia'
  ];
  
  const DIAS_POR_TIPO = {
    Licencia: {
      Contratado: 10, // Días fijos para contratados
      calcularPorAntiguedad: true // Indica que para otros casos se calcula por antigüedad
    },
    Parte_Medico: null, 
    Maternidad: 90,
    Paternidad: 5,
    Paternidad_Especial: 30,
    Matrimonio: 12,
    Matrimonio_Hijo: 2,
    Fallecimiento: 5,
    Enfermedad: 28,
    Guarda_Tenencia: 15,
    Particular: 6,
    Articulo:null,
    Profilactica: {
      dias: 10,
      soloMedicos: true 
    },
  };

  // Schedules para actualizaciones
  const ACTUALIZACION_DIARIA = '0 0 * * *'; // Todos los días a medianoche
  const ACTUALIZACION_OCTUBRE = '0 0 1 10 *'; // 1 de octubre a medianoche
  
  module.exports = {
    TIPOS_LICENCIA,
    DIAS_POR_TIPO,
    ACTUALIZACION_DIARIA,
    ACTUALIZACION_OCTUBRE
  };