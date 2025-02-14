const licenciasService = require('../licenciasService/licenciasService');
const actualizacionService = require('../automatizacion/licenciasAuto');

const licenciasController = {
  async getResumenLicencias(req, res) {
    try {
      const { operadorId } = req.params;
      const resumen = await licenciasService.getResumenLicencias(operadorId);
      res.json(resumen);
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

// Iniciar la actualización automática al arrancar el servidor
// actualizacionService.iniciarActualizacionAutomatica();

module.exports = licenciasController;