const API = "http://localhost:5000/api";

document.addEventListener("DOMContentLoaded", () => {
  loadRevenue();
  loadProducts();
  loadSales();
  loadCustomers();
  loadOrders();
});

async function loadRevenue() {
  const res = await fetch(`${API}/revenue`);
  const data = await res.json();
  new Chart(document.getElementById("paymentChart"), {
    type: "pie",
    data: {
      labels: data.map(r => r.Method),
      datasets: [{
        data: data.map(r => r.TotalRevenue),
        backgroundColor: ["#0077b6", "#00b4d8", "#90e0ef", "#caf0f8"]
      }]
    }
  });
}

async function loadProducts() {
  const res = await fetch(`${API}/top-products`);
  const data = await res.json();
  new Chart(document.getElementById("productChart"), {
    type: "bar",
    data: {
      labels: data.map(p => p.ProductName),
      datasets: [{
        label: "Units Sold",
        data: data.map(p => p.TotalSold),
        backgroundColor: "#0077b6"
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

async function loadSales() {
  const res = await fetch(`${API}/monthly-sales`);
  const data = await res.json();
  new Chart(document.getElementById("salesChart"), {
    type: "line",
    data: {
      labels: data.map(s => s.Month),
      datasets: [{
        label: "Sales (₹)",
        data: data.map(s => s.MonthlySales),
        borderColor: "#0077b6",
        fill: false,
        tension: 0.3
      }]
    }
  });
}

async function loadCustomers() {
  const res = await fetch(`${API}/customers`);
  const customers = await res.json();
  const table = document.getElementById("customerTable");
  customers.forEach(c => {
    table.innerHTML += `
      <tr>
        <td>${c.CustomerID}</td>
        <td>${c.Name}</td>
        <td>${c.MembershipType}</td>
        <td>${c.DiscountRate}</td>
      </tr>`;
  });
}

async function loadOrders() {
  const res = await fetch(`${API}/orders`);
  const orders = await res.json();
  const table = document.getElementById("orderTable");
  orders.forEach(o => {
    table.innerHTML += `
      <tr>
        <td>${o.OrderID}</td>
        <td>${o.CustomerName}</td>
        <td>${o.EmployeeName || "-"}</td>
        <td>₹${o.TotalAmount}</td>
      </tr>`;
  });
}
