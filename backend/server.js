// backend/server.js
import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// Simple health endpoint useful for debugging 404 issues
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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

// ✅ Universal SQL Executor (used by SQL Console and CRUD Forms)
app.post("/api/execute", (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "No query provided" });

  const forbidden = [
    "DROP DATABASE", "SHUTDOWN", "GRANT", "REVOKE",
    "DELETE FROM", "TRUNCATE", "DROP TABLE"
  ];
  
  if (forbidden.some(w => query.toUpperCase().includes(w))) {
    return res.status(400).json({ error: "This operation is not allowed for safety reasons" });
  }

  console.log("🧾 Executing Query:", query);

  db.query(query, (err, results, fields) => {
    if (err) {
      console.error("❌ SQL Error:", err);
      return res.status(500).json({ error: err.message });
    }

    // Normalize the response
    if (Array.isArray(results)) {
      // SELECT queries
      res.json(results);
    } else if (results.affectedRows !== undefined) {
      // INSERT, UPDATE, DELETE
      res.json({
        message: `✅ Operation successful. Affected ${results.affectedRows} row(s)`,
        insertId: results.insertId || null
      });
    } else {
      // CREATE, ALTER, etc.
      res.json({ message: "✅ Query executed successfully" });
    }
  });
});

// ------------------------------
// Product CRUD (safer than raw executor)
// ------------------------------

// Get single product
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });
  db.query('SELECT * FROM Product WHERE ProductID=?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  });
});

// List products (optional limit param, default 50)
app.get('/api/products', (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit <= 0 || limit > 200) limit = 50;
  db.query(`SELECT ProductID, ProductName, Price, CategoryID, SupplierID FROM Product ORDER BY ProductID LIMIT ?`, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create Product
app.post('/api/products', (req, res) => {
  const { ProductName, Price, CategoryID, SupplierID } = req.body;
  if (!ProductName || Price == null || !CategoryID || !SupplierID) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const q = `INSERT INTO Product (ProductName, Price, CategoryID, SupplierID) VALUES (?,?,?,?)`;
  db.query(q, [ProductName, Price, CategoryID, SupplierID], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    // Fetch the full inserted product for confirmation
    db.query('SELECT ProductID, ProductName, Price, CategoryID, SupplierID FROM Product WHERE ProductID=?', [result.insertId], (e2, rows) => {
      if (e2) return res.status(201).json({ message: 'Created', productId: result.insertId });
      res.status(201).json({ message: 'Created', product: rows[0] || { productId: result.insertId } });
    });
  });
});

// Update Product Price
app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });
  const { Price, ProductName, CategoryID, SupplierID } = req.body;

  const fields = [];
  const values = [];
  if (Price !== undefined) { fields.push('Price=?'); values.push(Price); }
  if (ProductName !== undefined) { fields.push('ProductName=?'); values.push(ProductName); }
  if (CategoryID !== undefined) { fields.push('CategoryID=?'); values.push(CategoryID); }
  if (SupplierID !== undefined) { fields.push('SupplierID=?'); values.push(SupplierID); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const q = `UPDATE Product SET ${fields.join(', ')} WHERE ProductID=?`;
  values.push(id);
  db.query(q, values, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found or no change' });
    }
    res.json({ message: 'Updated', affected: result.affectedRows });
  });
});

// Delete Product (supports cascade removal of Order_Item rows with ?cascade=true)
app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });
  const cascade = req.query.cascade === 'true';

  const performDelete = () => {
    db.beginTransaction(err => {
      if (err) return res.status(500).json({ error: err.message });

      const steps = [];
      if (cascade) {
        steps.push(cb => db.query('DELETE FROM Order_Item WHERE ProductID=?', [id], cb));
      } else {
        steps.push(cb => db.query('SELECT 1 FROM Order_Item WHERE ProductID=? LIMIT 1', [id], (e, rows) => {
          if (e) return cb(e);
            if (rows.length) return cb(new Error('REFERENCED')); // handled later
            cb();
        }));
      }
      // Inventory row will cascade because of FK ON DELETE CASCADE, delete product last
      steps.push(cb => db.query('DELETE FROM Product WHERE ProductID=?', [id], cb));

      let i = 0;
      const next = (err) => {
        if (err) {
          if (err.message === 'REFERENCED') {
            return db.rollback(() => res.status(409).json({
              error: 'Product is referenced by existing order items',
              hint: 'Re-run with ?cascade=true to remove related order items first'
            }));
          }
          return db.rollback(() => res.status(500).json({ error: err.message }));
        }
        if (i === steps.length) {
          return db.commit(e2 => {
            if (e2) return db.rollback(() => res.status(500).json({ error: e2.message }));
            res.json({ message: 'Deleted', cascaded: cascade });
          });
        }
        const fn = steps[i++];
        fn(next);
      };
      next();
    });
  };

  performDelete();
});

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);
