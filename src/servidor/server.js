const express = require("express")
const cors = require("cors")
const { initializeDatabase, testConnection, closeConnection } = require('../config/configbd');

const licenciasRoutes = require("../routes/licenciasRoutes")
const horasRoutes = require("../routes/horasRoutes")
const metricsRoutes = require("../routes/routerMetrics")
const errorHandler = require("../middleware/errorHandler")
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

// Routes

app.use("/api/licencias", licenciasRoutes)
app.use("/api/horas", horasRoutes)
app.use("/api/metrics", metricsRoutes)

// Middleware para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" })
})
// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 3008

async function startServer() {
  try {
    // Probar conexión e inicializar la base de datos
    await testConnection();
    await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Servidor iniciado exitosamente:
   - Puerto: ${PORT}
   - Modo: ${process.env.NODE_ENV}
   - Hora: ${new Date().toLocaleString()}`);
    });

    // Manejo de señales de terminación
    async function gracefulShutdown() {
      console.log("Iniciando apagado graceful...");
      await closeConnection();
      server.close(() => {
        console.log("Servidor cerrado.");
        process.exit(0);
      });
    }

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);

    process.on("uncaughtException", (error) => {
      console.error("Error no capturado:", error);
    });

    process.on("unhandledRejection", (error) => {
      console.error("Promesa rechazada no manejada:", error);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();