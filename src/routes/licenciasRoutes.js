const express = require("express")
const router = express.Router()
const licenciasController = require("../controllers/licenciasController")

// Rutas para licencias
router.get("/", licenciasController.getLicencias)
router.get("/pendientes", licenciasController.getLicenciasPendientes)
router.get("/disponibles/:empleadoId", licenciasController.getDiasDisponibles)

module.exports = router

