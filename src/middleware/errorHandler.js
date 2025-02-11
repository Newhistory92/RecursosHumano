const errorHandler = (err, req, res, next) => {
    console.error(err.stack)
  
    // Si es un error de SQL Server
    if (err.code && err.code.startsWith("ESQL")) {
      return res.status(500).json({
        error: "Error en la base de datos",
        details: process.env.NODE_ENV === "development" ? err.message : "Error interno del servidor",
      })
    }
  
    // Error general
    res.status(500).json({
      error: "Error interno del servidor",
      details: process.env.NODE_ENV === "development" ? err.message : "Algo salió mal",
    })
  }
  
  module.exports = errorHandler
  
  