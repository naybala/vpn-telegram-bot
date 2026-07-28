const mysql = require("mysql2/promise");

// ==================================================================
// 🗄️ DATABASE CONNECTION
// ==================================================================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test DB Connection on startup
db.getConnection()
  .then((conn) => {
    console.log("✅ Connected to MySQL Database");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err.message);
    process.exit(1);
  });

module.exports = db;
