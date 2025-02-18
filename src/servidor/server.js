const express = require("express")
const cors = require("cors")

const licenciasRoutes = require("../routes/licenciasRoutes")
// const horasRoutes = require("../routes/horasRoutes")
const errorHandler = require("../middleware/errorHandler")
const { testConnection } = require("../config/configbd");
require("dotenv").config()

const app = express()

// Middleware
app.use(cors({
  origin: "http://localhost:3000", // URL de tu frontend
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}))
app.use(express.json())
testConnection();
// Routes

app.use("/api/licencias", licenciasRoutes)
// app.use("/api/horas", horasRoutes)

// Middleware para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" })
})
// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 3008

const server = app.listen(PORT, () => {
  console.log(`
🚀 Servidor iniciado exitosamente:
   - Puerto: ${PORT}
   - Modo: ${process.env.NODE_ENV}
   - Hora: ${new Date().toLocaleString()}
📅 Actualizaciones automáticas programadas para las 16:00
  `)
})

process.on("uncaughtException", (error) => {
  console.error("Error no capturado:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Promesa rechazada no manejada:", error);
});

// Manejo de señales de terminación
process.on("SIGTERM", () => {
  console.log("Recibida señal SIGTERM. Cerrando servidor...")
  server.close(() => {
    console.log("Servidor cerrado.")
    process.exit(0)
  })
})

process.on("SIGINT", () => {
  console.log("Recibida señal SIGINT. Cerrando servidor...")
  server.close(() => {
    console.log("Servidor cerrado.")
    process.exit(0)
  })
})