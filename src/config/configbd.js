const sql = require("mssql")
require("dotenv").config(); 

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

async function testConnection() {
  try {
    const pool = await sql.connect(dbConfig)
    console.log("Conexión exitosa a la base de datos")
    await pool.close()
  } catch (err) {
    console.error("Error en la conexión:", err)
  }
}

// Pool de conexiones para reutilizar
const getConnection = async () => {
  try {
    const pool = await sql.connect(dbConfig)
    return pool
  } catch (error) {
    console.error("Error al obtener conexión:", error)
    throw error
  }
}

module.exports = { dbConfig, testConnection, getConnection }