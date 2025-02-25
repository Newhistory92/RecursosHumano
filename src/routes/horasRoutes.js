const express = require('express');
const router = express.Router();
const HorasController = require('../controllers/horasController');

// Crear una instancia del controlador
const horasController = new HorasController();

// Definir las rutas
router.get('/resumen/:operadorId', horasController.obtenerResumenHoras);
router.post('/ausencias', horasController.agregarAusencia);
router.delete('/ausencias/:ausenciaId', horasController.eliminarAusencia);
router.put('/ausencias/:ausenciaId/justificar', horasController.justificarAusencia);
router.get('/ausencias/:operadorId', horasController.listarAusencias);
router.get('/registro-horas/:operadorId', horasController.getRegistroHorasDiarias);
//router.put('/horasExtra/:operadorId', horasController.actualizarHorasExtra);

module.exports = router;

