const licenciasService = require('../licenciasService/licenciasService');


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


module.exports = licenciasController;