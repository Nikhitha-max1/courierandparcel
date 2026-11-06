const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Dashboard summary
app.get("/api/dashboard", asyncRoute(async (req, res) => {
  const [[customers]] = await db.query("SELECT COUNT(*) AS total FROM customers");
  const [[parcels]] = await db.query("SELECT COUNT(*) AS total FROM parcels");
  const [[delivered]] = await db.query("SELECT COUNT(*) AS total FROM parcels WHERE LOWER(status) = 'delivered'");
  const [[pending]] = await db.query("SELECT COUNT(*) AS total FROM parcels WHERE LOWER(status) NOT IN ('delivered', 'cancelled')");
  res.json({ customers: customers.total, parcels: parcels.total, delivered: delivered.total, pending: pending.total });
}));

// Customers
app.get("/api/customers", asyncRoute(async (req, res) => {
  const [rows] = await db.query("SELECT * FROM customers ORDER BY customer_id DESC");
  res.json(rows);
}));

app.post("/api/customers", asyncRoute(async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name || !phone) return res.status(400).json({ message: "Name and phone are required." });
  const [result] = await db.query(
    "INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
    [name, email || null, phone, address || null]
  );
  res.status(201).json({ message: "Customer added successfully.", customer_id: result.insertId });
}));

// Parcels and booking
app.get("/api/parcels", asyncRoute(async (req, res) => {
  const [rows] = await db.query(`
    SELECT p.*, c.name AS customer_name, c.phone AS customer_phone
    FROM parcels p
    LEFT JOIN customers c ON p.customer_id = c.customer_id
    ORDER BY p.parcel_id DESC
  `);
  res.json(rows);
}));

app.post("/api/parcels", asyncRoute(async (req, res) => {
  const {
    customer_id, sender_address, receiver_name, receiver_phone,
    receiver_address, weight, booking_date
  } = req.body;

  if (!customer_id || !sender_address || !receiver_name || !receiver_phone ||
      !receiver_address || !weight) {
    return res.status(400).json({ message: "Please fill all required booking fields." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO parcels
       (customer_id, sender_address, receiver_name, receiver_phone, receiver_address, weight, booking_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Booked')`,
      [customer_id, sender_address, receiver_name, receiver_phone, receiver_address,
       Number(weight), booking_date || new Date().toISOString().slice(0, 10)]
    );
    await conn.query(
      `INSERT INTO tracking (parcel_id, current_location, tracking_status, updated_at, remarks)
       VALUES (?, ?, ?, NOW(), ?)`,
      [result.insertId, "Booking Office", "Booked", "Parcel booking created"]
    );
    await conn.commit();
    res.status(201).json({ message: "Parcel booked successfully.", parcel_id: result.insertId });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.patch("/api/parcels/:id/status", asyncRoute(async (req, res) => {
  const { status, current_location, remarks } = req.body;
  const parcelId = req.params.id;
  if (!status) return res.status(400).json({ message: "Status is required." });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query("UPDATE parcels SET status = ? WHERE parcel_id = ?", [status, parcelId]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: "Parcel not found." });
    }
    await conn.query(
      `INSERT INTO tracking (parcel_id, current_location, tracking_status, updated_at, remarks)
       VALUES (?, ?, ?, NOW(), ?)`,
      [parcelId, current_location || "Location not updated", status, remarks || "Status updated"]
    );
    await conn.commit();
    res.json({ message: "Parcel status updated." });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

// Tracking
app.get("/api/tracking/:parcelId", asyncRoute(async (req, res) => {
  const [parcelRows] = await db.query(
    `SELECT p.*, c.name AS customer_name
     FROM parcels p LEFT JOIN customers c ON p.customer_id = c.customer_id
     WHERE p.parcel_id = ?`,
    [req.params.parcelId]
  );
  if (!parcelRows.length) return res.status(404).json({ message: "No parcel found with that ID." });
  const [history] = await db.query(
    "SELECT * FROM tracking WHERE parcel_id = ? ORDER BY updated_at DESC, tracking_id DESC",
    [req.params.parcelId]
  );
  res.json({ parcel: parcelRows[0], history });
}));

app.post("/api/tracking", asyncRoute(async (req, res) => {
  const { parcel_id, current_location, tracking_status, remarks } = req.body;
  if (!parcel_id || !current_location || !tracking_status) {
    return res.status(400).json({ message: "Parcel ID, location and status are required." });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO tracking (parcel_id, current_location, tracking_status, updated_at, remarks)
       VALUES (?, ?, ?, NOW(), ?)`,
      [parcel_id, current_location, tracking_status, remarks || null]
    );
    await conn.query("UPDATE parcels SET status = ? WHERE parcel_id = ?", [tracking_status, parcel_id]);
    await conn.commit();
    res.status(201).json({ message: "Tracking update added.", tracking_id: result.insertId });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

// Payments
app.get("/api/payments", asyncRoute(async (req, res) => {
  const [rows] = await db.query(`
    SELECT pay.*, p.receiver_name, p.receiver_phone
    FROM payments pay
    LEFT JOIN parcels p ON pay.parcel_id = p.parcel_id
    ORDER BY pay.payment_id DESC
  `);
  res.json(rows);
}));

app.post("/api/payments", asyncRoute(async (req, res) => {
  const { parcel_id, amount, payment_method, payment_status } = req.body;
  if (!parcel_id || amount === undefined || !payment_method || !payment_status) {
    return res.status(400).json({ message: "Please complete all payment fields." });
  }
  const [result] = await db.query(
    `INSERT INTO payments (parcel_id, amount, payment_method, payment_status)
     VALUES (?, ?, ?, ?)`,
    [parcel_id, Number(amount), payment_method, payment_status]
  );
  res.status(201).json({ message: "Payment recorded.", payment_id: result.insertId });
}));

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: "Server/database error. Check your MySQL connection and table column names.",
    error: err.sqlMessage || err.message
  });
});

app.listen(PORT, () => console.log(`Courier system running at http://localhost:${PORT}`));
