const express = require('express');
const router = express.Router();
const HorasController = require('../controllers/horasController');

// Crear una instancia del controlador
const horasController = new HorasController();

// Definir las rutas
router.get('/resumen/:operadorId', horasController.obtenerResumenHoras);
router.post('/ausencias', horasController.agregarAusencia);
router.delete('/ausencias/:ausenciaId', horasController.eliminarAusencia);
router.get('/listar-ausencias/:operadorId', horasController.listarAusencias);

module.exports = router;

