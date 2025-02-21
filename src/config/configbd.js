const sql = require("mssql")
require("dotenv").config(); 
const { QUERIES } = require('../utils/queries');

// Configuración de la base de datos
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}

// Variable para mantener el pool de conexiones
let globalPool = null;

// Pool de conexiones para reutilizar
const getConnection = async () => {
  try {
    if (!globalPool) {
      globalPool = await sql.connect(dbConfig);
    }
    return globalPool;
  } catch (error) {
    console.error("Error al obtener conexión:", error);
    throw error;
  }
};

async function testConnection() {
  try {
    await getConnection();
    console.log("Conexión exitosa a la base de datos");
  } catch (err) {
    console.error("Error en la conexión:", err);
    throw err;
  }
}

async function initializeDatabase() {
  try {
    const pool = await getConnection();
    
    // Crear tabla si no existe
    await pool.request().query(QUERIES.crearTablaHorasTrabajadas);
    
    console.log('Base de datos inicializada correctamente');
  } catch (error) {
    console.error('Error inicializando la base de datos:', error);
    throw error;
  }
}

// Función para cerrar la conexión cuando sea necesario
async function closeConnection() {
  if (globalPool) {
    try {
      await globalPool.close();
      globalPool = null;
      console.log('Conexión cerrada correctamente');
    } catch (error) {
      console.error('Error al cerrar la conexión:', error);
      throw error;
    }
  }
}

module.exports = { 
  dbConfig, 
  testConnection, 
  getConnection, 
  initializeDatabase,
  closeConnection 
};