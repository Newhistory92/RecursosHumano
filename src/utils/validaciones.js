function validarOperadorId(operadorId) {
  // Verificar que no sea null o undefined
  if (!operadorId) return false;

  // Si es un número, convertirlo a string
  if (typeof operadorId === 'number') {
    operadorId = operadorId.toString();
  }

  // Verificar que sea un string
  if (typeof operadorId !== 'string') return false;

  // Eliminar espacios en blanco
  operadorId = operadorId.trim();

  // Verificar que no esté vacío
  if (operadorId === '') return false;

  // Verificar el formato: puede contener números, letras y guiones
  // Ajusta esta expresión regular según el formato real de tus IDs
  return /^[a-zA-Z0-9-]+$/.test(operadorId);
}

// Función para validar el formato de fecha
function validarFecha(fecha) {
  if (!fecha) return false;
  const fechaObj = new Date(fecha);
  return fechaObj instanceof Date && !isNaN(fechaObj);
}

// Función para validar el formato de hora
function validarHora(hora) {
  if (!hora) return false;
  // Formato HH:MM:SS o HH:MM
  return /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(hora);
}

module.exports = {
  validarOperadorId,
  validarFecha,
  validarHora
}; 