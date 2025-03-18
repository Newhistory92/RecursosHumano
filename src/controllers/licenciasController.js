const licenciasService = require('../licenciasService/licenciasService');
const ActualizacionService = require('../automatizacion/licenciasAuto');

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
  },


  async agendarLicencia(req, res) {
    try {
      const { operadorId } = req.params;
      const { tipo, fechaInicio, fechaFin, anio, cantidad } = req.body;
      const licencia = await licenciasService.agendarLicencia(operadorId, tipo, fechaInicio, fechaFin, anio, cantidad);
      res.json(licencia);
    } catch (error) {
      console.error('Error agendando licencia:', error);
      res.status(500).json({ error: error.message });
    }
  },


  async actualizarLicencia(req, res) {
    try {
      console.log("Cuerpo recibido en el controlador:", req.body); // <-- Verifica el payload
  
      const { operadorId } = req.params;
      const { payload } = req.body;
      const { id, fechaInicio, fechaFin, cantidad, tipo, usoId, oldanio, oldCantidad, oldTipo } = payload || {};
      
  
      console.log("Datos extraídos:", { id, fechaInicio, fechaFin, cantidad, tipo, usoId, oldanio, oldCantidad, oldTipo });
  
      const licencia = await licenciasService.actualizarLicencia(
        operadorId, id, fechaInicio, fechaFin, cantidad, tipo, usoId, oldanio, oldCantidad, oldTipo
      );
  
      res.json(licencia);
    } catch (error) {
      console.error('Error agendando licencia:', error);
      res.status(500).json({ error: error.message });
    }
  },
  

  async eliminarLicencia(req, res) {
    try {
      const { operadorId, licenciaId, oldCantidad, usoId } = req.params;
      
      const licencia = await licenciasService.eliminarLicencia( operadorId, licenciaId, oldCantidad, usoId);
      res.json(licencia);
    } catch (error) {
      console.error('Error agendando licencia:', error);
      res.status(500).json({ error: error.message });
    }
  },



  async LicenciasPorAnios(req, res) {
    try {
      const {  personalId } = req.params;
      const licencia = await licenciasService.obtenerLicenciasPorAnios( personalId);
      res.json(licencia);
    } catch (error) {
      console.error('Error agendando licencia:', error);
      res.status(500).json({ error: error.message });
    }
  },

  
  async obtenerResumenGeneral(req, res) {
    try {
      const resumen = await licenciasService.obtenerResumenGeneral();
  
      if (!resumen) {
        return res.status(404).json({
          error: "No se encontró información en el resumen general",
        });
      }
  
      res.json(resumen);
    } catch (error) {
      console.error('Error obteniendo resumen general:', error);
      res.status(500).json({ error: 'Error obteniendo el resumen general', mensaje: error.message });
    }
  }
  
  
};

ActualizacionService.iniciarActualizacionDiaria();
ActualizacionService.iniciarActualizacionAutomatica()
module.exports = licenciasController;