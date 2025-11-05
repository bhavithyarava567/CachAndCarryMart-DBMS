// backend/server.js
import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1️⃣ Revenue per Payment Method
app.get("/api/revenue", (req, res) => {
  const q = `
    SELECT Method, SUM(AmountPaid) AS TotalRevenue
    FROM Payment
    GROUP BY Method
    ORDER BY TotalRevenue DESC
  `;
  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// 2️⃣ Top 3 Most Sold Products
app.get("/api/top-products", (req, res) => {
  const q = `
    SELECT p.ProductName, SUM(oi.Quantity) AS TotalSold
    FROM Order_Item oi
    JOIN Product p ON oi.ProductID = p.ProductID
    GROUP BY p.ProductName
    ORDER BY TotalSold DESC
    LIMIT 3
  `;
  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// 3️⃣ Monthly Sales
app.get("/api/monthly-sales", (req, res) => {
  const q = `
    SELECT DATE_FORMAT(OrderDate, '%Y-%m') AS Month, SUM(TotalAmount) AS MonthlySales
    FROM \`Order\`
    GROUP BY DATE_FORMAT(OrderDate, '%Y-%m')
    ORDER BY Month
  `;
  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// 4️⃣ Customers with Membership
app.get("/api/customers", (req, res) => {
  const q = `
    SELECT c.CustomerID, c.Name, m.Type AS MembershipType, m.DiscountRate
    FROM Customer c
    JOIN Membership m ON c.MembershipID = m.MembershipID
  `;
  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// 5️⃣ Orders List
app.get("/api/orders", (req, res) => {
  const q = `
    SELECT o.OrderID, c.Name AS CustomerName, e.Name AS EmployeeName, o.TotalAmount
    FROM \`Order\` o
    JOIN Customer c ON o.CustomerID = c.CustomerID
    LEFT JOIN Employee e ON o.EmployeeID = e.EmployeeID
    ORDER BY o.OrderID DESC
    LIMIT 10
  `;
  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// ✅ Execute custom SQL queries (for demo/admin use only)
app.post("/api/execute", (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "No query provided" });

  // prevent extremely dangerous operations for safety
  const forbidden = [
    "DROP DATABASE", "SHUTDOWN", "GRANT", "REVOKE",
    "DELETE FROM", "TRUNCATE", "DROP TABLE" // Add any other dangerous operations you want to prevent
  ];
  
  // Check for dangerous operations
  if (forbidden.some(w => query.toUpperCase().includes(w))) {
    return res.status(400).json({ error: "This operation is not allowed for safety reasons" });
  }

  // Execute the query
  db.query(query, (err, results, fields) => {
    if (err) {
      console.error("❌ SQL Error:", err);
      return res.status(500).json({ error: err.message });
    }

    // Handle different types of queries
    if (Array.isArray(results)) {
      // SELECT queries return array
      res.json({ results });
    } else if (results.affectedRows !== undefined) {
      // INSERT, UPDATE, DELETE queries
      res.json({
        results: {
          message: `Operation successful. Affected ${results.affectedRows} row(s)`,
          affectedRows: results.affectedRows,
          insertId: results.insertId
        }
      });
    } else if (results.fieldCount !== undefined) {
      // DDL queries (CREATE, ALTER, etc.)
      res.json({
        results: {
          message: "Operation completed successfully"
        }
      });
    } else {
      // Other types of queries
      res.json({ results });
    }

    // Response has already been sent above
  });
});

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);
