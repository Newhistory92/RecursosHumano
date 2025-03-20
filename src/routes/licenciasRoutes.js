const express = require('express');
const router = express.Router();
const licenciasController = require('../controllers/licenciasController');

router.get('/resumen/:operadorId', licenciasController.getResumenLicencias);
router.post('/agendar/:operadorId', licenciasController.agendarLicencia);
router.put('/actualizar/:operadorId', licenciasController.actualizarLicencia);
router.delete('/eliminar/:operadorId/:licenciaId/:oldCantidad/:usoId', licenciasController.eliminarLicencia);
router.get('/licenciaporanio/:personalId', licenciasController.LicenciasPorAnios);
router.get('/resumen-general', licenciasController.obtenerResumenGeneral);
router.get('/calcular-dias/:operadorId', licenciasController.calcularDiasLicenciaManual);

module.exports = router;


