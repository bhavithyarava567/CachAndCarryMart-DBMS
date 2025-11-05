// backend/db.js
import mysql from "mysql2";

export const db = mysql.createConnection({
  host: "localhost",       // keep as localhost if MySQL runs locally
  user: "root",            // your MySQL username
  password: "bhavith",  // 🔒 replace with your real MySQL password
  database: "CashAndCarryMart",
  multipleStatements: true,    // must match your .sql database name
});

db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL Database: CashAndCarryMart");
  }
});
