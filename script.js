const API = "/api";
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const money = value => "₹" + Number(value || 0).toFixed(2);
const statusClass = value => {
  const s = String(value || "").toLowerCase();
  if (s === "delivered" || s === "paid") return s;
  if (s === "cancelled" || s === "failed") return s;
  if (s === "pending" || s === "booked") return s;
  return "";
};
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}
function showMessage(selector, message, error = false) {
  const el = $(selector);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
}
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

async function loadDashboard() {
  const date = $("#todayDate");
  if (date) date.textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  try {
    const data = await request(`${API}/dashboard`);
    $("#customerCount").textContent = data.customers;
    $("#parcelCount").textContent = data.parcels;
    $("#deliveredCount").textContent = data.delivered;
    $("#pendingCount").textContent = data.pending;
  } catch (e) { console.error(e); }
}
async function loadCustomers() {
  const body = $("#customersTable");
  if (!body) return;
  try {
    const rows = await request(`${API}/customers`);
    body.innerHTML = rows.length ? rows.map(c => `<tr><td>#${c.customer_id}</td><td><strong>${esc(c.name)}</strong></td><td>${esc(c.email || "—")}</td><td>${esc(c.phone)}</td><td>${esc(c.address || "—")}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">No customers added yet.</td></tr>`;
  } catch (e) { body.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)}</td></tr>`; }
}
async function loadParcels() {
  const body = $("#parcelsTable");
  if (!body) return;
  try {
    const rows = await request(`${API}/parcels`);
    body.innerHTML = rows.length ? rows.map(p => `<tr><td><strong>#${p.parcel_id}</strong></td><td>${esc(p.customer_name || "—")}</td><td>${esc(p.receiver_name)}</td><td>${Number(p.weight).toFixed(2)} kg</td><td>${esc(p.booking_date ? String(p.booking_date).slice(0,10) : "—")}</td><td><span class="status ${statusClass(p.status)}">${esc(p.status)}</span></td></tr>`).join("") : `<tr><td colspan="6" class="empty">No parcel bookings found.</td></tr>`;
  } catch (e) { body.innerHTML = `<tr><td colspan="6" class="empty">${esc(e.message)}</td></tr>`; }
}
async function loadPayments() {
  const body = $("#paymentsTable");
  if (!body) return;
  try {
    const rows = await request(`${API}/payments`);
    body.innerHTML = rows.length ? rows.map(p => `<tr><td>#${p.payment_id}</td><td>#${p.parcel_id}</td><td>${esc(p.receiver_name || "—")}</td><td>${money(p.amount)}</td><td>${esc(p.payment_method)}</td><td><span class="status ${statusClass(p.payment_status)}">${esc(p.payment_status)}</span></td></tr>`).join("") : `<tr><td colspan="6" class="empty">No payment records found.</td></tr>`;
  } catch (e) { body.innerHTML = `<tr><td colspan="6" class="empty">${esc(e.message)}</td></tr>`; }
}
function setupForm(id, endpoint, messageSelector, success, after) {
  const form = $(id);
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const data = await request(endpoint, { method:"POST", body:JSON.stringify(formData(form)) });
      showMessage(messageSelector, `${success}${data.parcel_id ? ` Parcel ID: ${data.parcel_id}` : ""}`);
      form.reset();
      if (after) after();
    } catch (e) { showMessage(messageSelector, e.message, true); }
  });
}
async function searchTracking(parcelId) {
  const result = $("#trackingResult");
  result.innerHTML = `<p class="empty">Searching...</p>`;
  try {
    const data = await request(`${API}/tracking/${encodeURIComponent(parcelId)}`);
    const p = data.parcel;
    result.innerHTML = `<div class="parcel-summary"><h3>Parcel #${p.parcel_id} · ${esc(p.receiver_name)}</h3><p><b>Current status:</b> <span class="status ${statusClass(p.status)}">${esc(p.status)}</span></p><p><b>Receiver phone:</b> ${esc(p.receiver_phone)}</p><p><b>Delivery address:</b> ${esc(p.receiver_address)}</p><p><b>Weight:</b> ${Number(p.weight).toFixed(2)} kg</p></div>
      <h3 class="history-title">Tracking history</h3>
      <div class="timeline">${data.history.length ? data.history.map(t => `<div class="timeline-item"><strong>${esc(t.tracking_status)} · ${esc(t.current_location)}</strong><small>${esc(t.updated_at ? new Date(t.updated_at).toLocaleString("en-IN") : "")}</small><p>${esc(t.remarks || "No remarks")}</p></div>`).join("") : `<p class="empty">No tracking updates available.</p>`}</div>`;
  } catch (e) { result.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  loadCustomers();
  loadParcels();
  loadPayments();

  setupForm("#customerForm", `${API}/customers`, "#customerMessage", "Customer added successfully.", loadCustomers);
  setupForm("#bookingForm", `${API}/parcels`, "#bookingMessage", "Parcel booked successfully.", loadParcels);
  setupForm("#trackingForm", `${API}/tracking`, "#trackingMessage", "Tracking update saved.", () => {});
  setupForm("#paymentForm", `${API}/payments`, "#paymentMessage", "Payment recorded successfully.", loadPayments);

  $("#trackingSearch")?.addEventListener("submit", event => {
    event.preventDefault();
    searchTracking(formData(event.currentTarget).parcel_id);
  });
  $("#refreshCustomers")?.addEventListener("click", loadCustomers);
  $("#refreshPayments")?.addEventListener("click", loadPayments);
  const date = $("#bookingDate");
  if (date) date.value = new Date().toISOString().slice(0,10);
});
