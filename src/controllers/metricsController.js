const metricService = require('../metrics/metricService');
const metricAfiliados = require('../metrics/metricasAfiliados');
const { getPrestadorMetrics } = require('../metrics/metricasPrestador');


const metricsController = {
  async quejasPorDepartamento(req, res) {
    try {
      const data = await metricService.getQuejasPorDepartamento();
      res.json({ data });
    } catch (error) {
      console.error('Error obteniendo quejas por departamento:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async licenciasPorTipo(req, res) {
    try {
      const data = await metricService.getLicenciasPorTipo();
      res.json({ data });
    } catch (error) {
      console.error('Error obteniendo licencias por tipo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async resumenMensual(req, res) {
    try {
      const { operadorId } = req.params;
      const data = await metricService.obtenerResumenMensual(operadorId);
      res.json(data);
    } catch (error) {
      console.error('Error obteniendo resumen mensual:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async obtenerAfiliados(req, res) {
    try {
      const data = await metricAfiliados.getAfiliadosMetrics();
      res.json({ data });
    } catch (error) {
      console.error('Error obteniendo datos de afiliados:', error);
      res.status(500).json({ error: error.message });
    }
  },


  
  async obtenerPrestadores(req, res) {
    try {
      await getPrestadorMetrics(req, res); 
    } catch (error) {
      console.error('Error obteniendo datos de prestadores:', error);
      res.status(500).json({ error: error.message });
    }
  }

};

module.exports = metricsController;
