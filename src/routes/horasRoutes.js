const express = require('express');
const router = express.Router();
const HorasController = require('../controllers/horasController');

// Crear una instancia del controlador
const horasController = new HorasController();

// Definir las rutas
router.get('/resumen/:operadorId', horasController.obtenerResumenHoras);
router.post('/sincronizar', horasController.sincronizarHoras);
//router.put('/horasExtra/:operadorId', horasController.actualizarHorasExtra);

module.exports = router;

