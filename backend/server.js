// backend/server.js
import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// Simple health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});


app.post("/api/setup-triggers", (req, res) => {
  const sql = `
  -- Drop old versions if exist
  DROP TRIGGER IF EXISTS after_order_item_insert_total;
  DROP PROCEDURE IF EXISTS GetCustomerDiscount;

  -- Create Trigger: Auto-update total when items are inserted
  DELIMITER $$
  CREATE TRIGGER after_order_item_insert_total
  AFTER INSERT ON Order_Item
  FOR EACH ROW
  BEGIN
    UPDATE \`Order\`
    SET TotalAmount = (
      SELECT IFNULL(SUM(SubTotal), 0)
      FROM Order_Item
      WHERE OrderID = NEW.OrderID
    )
    WHERE OrderID = NEW.OrderID;
  END $$
  DELIMITER ;

  -- Create Procedure: GetCustomerDiscount
  DELIMITER $$
  CREATE PROCEDURE GetCustomerDiscount(IN customerName VARCHAR(100))
  BEGIN
      SELECT 
          c.CustomerID,
          c.Name AS CustomerName,
          m.Type AS MembershipType,
          m.DiscountRate AS DiscountPercent,
          m.ExpiryDate
      FROM Customer c
      LEFT JOIN Membership m ON c.MembershipID = m.MembershipID
      WHERE c.Name = customerName;
  END $$
  DELIMITER ;
  `;

  db.query(sql, (err) => {
    if (err) {
      console.error("❌ SQL setup error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "✅ Triggers and stored procedure created successfully!" });
  });
});


app.get("/api/triggers", (req, res) => {
  db.query("SHOW TRIGGERS;", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});


app.get("/api/procedures", (req, res) => {
  const sql = `
    SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED, LAST_ALTERED
    FROM INFORMATION_SCHEMA.ROUTINES
    WHERE ROUTINE_SCHEMA = DATABASE();
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// -----------------------------------------------------------
// 🧩 4️⃣ Execute stored procedure GetCustomerDiscount
// -----------------------------------------------------------
app.get("/api/discount/:name", (req, res) => {
  const { name } = req.params;
  db.query("CALL GetCustomerDiscount(?);", [name], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // MySQL returns nested array; normalize it
    res.json(results[0] || []);
  });
});

// -----------------------------------------------------------
// 🔥 Existing routes (dashboard data, CRUD, SQL executor)
// -----------------------------------------------------------

// 1️⃣ Revenue by Payment Method
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

// 2️⃣ Top Products
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

// 4️⃣ Customers + Membership
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

// 5️⃣ Orders
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

// ✅ Universal SQL Executor (for SQL console)
app.post("/api/execute", (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "No query provided" });

  const forbidden = [
    "DROP DATABASE", "SHUTDOWN", "GRANT", "REVOKE",
    "DELETE FROM", "TRUNCATE", "DROP TABLE"
  ];
  if (forbidden.some(w => query.toUpperCase().includes(w))) {
    return res.status(400).json({ error: "This operation is not allowed" });
  }

  console.log("🧾 Executing Query:", query);

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(results)) res.json(results);
    else if (results.affectedRows !== undefined)
      res.json({ message: `✅ Success (${results.affectedRows} row(s) affected)` });
    else res.json({ message: "✅ Query executed successfully" });
  });
});

// ------------------------------
// Product CRUD
// ------------------------------
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.query('SELECT * FROM Product WHERE ProductID=?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  });
});

app.get('/api/products', (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit <= 0 || limit > 200) limit = 50;
  db.query('SELECT * FROM Product ORDER BY ProductID LIMIT ?', [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { ProductName, Price, CategoryID, SupplierID } = req.body;
  if (!ProductName || Price == null || !CategoryID || !SupplierID)
    return res.status(400).json({ error: 'Missing fields' });

  const q = `INSERT INTO Product (ProductName, Price, CategoryID, SupplierID) VALUES (?,?,?,?)`;
  db.query(q, [ProductName, Price, CategoryID, SupplierID], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Created', productId: result.insertId });
  });
});

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);
