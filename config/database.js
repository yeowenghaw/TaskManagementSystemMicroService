const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

// config.env file variables
// show the path that stores our config variables
dotenv.config({ path: "./config/config.env" });

let pool;

const getConnectionPool = () => {
  // Create MySQL connection

  // if SQL connection pool does not exist then create it
  if (!pool) {
    try {
      console.log("creating connection pool");
      pool = mysql.createPool({
        host: process.env.HOST,
        user: process.env.USER,
        password: process.env.PASSWORD,
        database: process.env.DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        port: 3306
      });
    } catch (error) {
      console.log(error);
    }
    console.log("connection pool created");
  }
  // const connection = await pool.getConnection();
  // //console.log(connection);
  // return connection;

  return pool;
};
module.exports = { getConnectionPool };
