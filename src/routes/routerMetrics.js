const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController');

// Ruta para obtener las quejas por departamento
router.get('/quejas-por-departamento', metricsController.quejasPorDepartamento);
router.get('/licencias-por-tipo', metricsController.licenciasPorTipo);
router.get('/resumen-mensual/:operadorId', metricsController.resumenMensual);

module.exports = router;
