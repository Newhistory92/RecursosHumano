const express = require('express');
const router = express.Router();
const horasController = require('../controllers/horasController');

// Obtener resumen de horas trabajadas
router.get('/resumen/:operadorId', horasController.obtenerResumen);

// Endpoint para sincronización manual (solo para pruebas/admin)
router.post('/sincronizar', horasController.sincronizarManual);

module.exports = router;

