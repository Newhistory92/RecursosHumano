const sql = require("mssql")
require("dotenv").config(); 
const { QUERIES } = require('../utils/queries');

// Configuración de la base de datos
const baseConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}
const dbConfig1 = { ...baseConfig, database: process.env.DB_PAGINA }; // Primera DB
const dbConfig2 = { ...baseConfig, database: process.env.DB_OSP }; // Segunda DB
// Variable para mantener el pool de conexiones
let poolDB1 = null;
let poolDB2 = null;

// Pool de conexiones para reutilizar
const getConnection = async () => {
  try {
    if (!poolDB1) {
      poolDB1 = await sql.connect( dbConfig1);
    }
    return poolDB1;
  } catch (error) {
    console.error("Error al obtener conexión:", error);
    throw error;
  }
};

const getConnectionDB2 = async () => {
  try {
    if (!poolDB2) {
      poolDB2 = await sql.connect(dbConfig2);
    }
    return poolDB2;
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
      if (poolDB1) await poolDB1.close();
      if (poolDB2) await poolDB2.close();
      poolDB1 = null;
      poolDB2 = null;
      console.log('Conexión cerrada correctamente');
    } catch (error) {
      console.error('Error al cerrar la conexión:', error);
      throw error;
    }
  }
}

module.exports = { 
  baseConfig, 
  testConnection, 
  getConnection, 
  getConnectionDB2,
  initializeDatabase,
  closeConnection 
};