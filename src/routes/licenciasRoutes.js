const express = require('express');
const router = express.Router();
const licenciasController = require('../controllers/licenciasController');
// console.log("licenciasController:", licenciasController);
// Rutas para consulta de licencias
router.get('/resumen/:operadorId', licenciasController.getResumenLicencias);
router.post('/agendar/:operadorId', licenciasController.agendarLicencia);
router.put('/actualizar/:operadorId', licenciasController.actualizarLicencia);
router.delete('/eliminar/:operadorId/:licenciaId/:oldCantidad/:usoId', licenciasController.eliminarLicencia);
router.get('/licenciaporanio/:personalId', licenciasController.LicenciasPorAnios);
router.get('/resumen-general', licenciasController.obtenerResumenGeneral);

// Ruta para forzar actualización manual (solo para pruebas/admin)
router.post('/actualizarAutomatica', async (req, res) => {
  try {
    await licenciasController.actualizacionAutomatica();
    res.json({ message: 'Actualización completada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


