const TIPOS_LICENCIA = [
    'Licencia', 'Parte_Medico', 'Profilactica', 'Particular',
    'Matrimonio', 'Matrimonio_Hijo', 'Paternidad', 'Paternidad_Especial',
    'Maternidad', 'Fallecimiento', 'Enfermedad', 'Guarda_Tenencia','Articulo'
  ];
  
  const DIAS_POR_TIPO = {
    Licencia: {
      Contratado: 10, // Días fijos para contratados
      calcularPorAntiguedad: true // Indica que para otros casos se calcula por antigüedad
    },
    Parte_Medico: null, 
    Articulo: null,
    Maternidad: 90,
    Paternidad: 5,
    Paternidad_Especial: 30,
    Matrimonio: 12,
    Matrimonio_Hijo: 2,
    Fallecimiento: 5,
    Enfermedad: 28,
    Guarda_Tenencia: 15,
    Particular: 6,
    Profilactica: {
      dias: 10,
      soloMedicos: true 
    },
  };


  
  const HORAS_POR_CONDICION = {
    'Contratado':6,
    'Planta_Permanente': 7,
    'Medico': 6,
    'Comisionado': null
    // Agregar otras condiciones según sea necesario
  };

  module.exports = {
    TIPOS_LICENCIA,
    DIAS_POR_TIPO,
    HORAS_POR_CONDICION
  };