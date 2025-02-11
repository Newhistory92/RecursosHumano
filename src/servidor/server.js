const express = require("express")
const cors = require("cors")
const licenciasRoutes = require("./routes/licenciasRoutes")
const horasRoutes = require("./routes/horasRoutes")
const errorHandler = require("./middleware/errorHandler")
require("dotenv").config()

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use("/api/licencias", licenciasRoutes)
app.use("/api/horas", horasRoutes)

// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 3008

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
})

