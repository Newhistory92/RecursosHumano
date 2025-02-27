const express = require('express');
const router = express.Router();
const licenciasController = require('../controllers/licenciasController');
// console.log("licenciasController:", licenciasController);
// Rutas para consulta de licencias
router.get('/resumen/:operadorId', licenciasController.getResumenLicencias);
router.post('/agendar/:operadorId', licenciasController.agendarLicencia);
// router.get('/historial/:operadorId', licenciasController.getHistorialLicencias);

// Ruta para forzar actualización manual (solo para pruebas/admin)
router.post('/actualizar', async (req, res) => {
  try {
    await licenciasController.actualizacionAutomatica();
    res.json({ message: 'Actualización completada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


