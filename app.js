const SUPABASE_URL = "https://ifbvulvyhledklktzjrv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYnZ1bHZ5aGxlZGtsa3R6anJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTE4OTUsImV4cCI6MjEwODk2Nzg5NX0.V0RQSqrZWVUIXprRjy5z5ax-4e8MT51yclDgpbf0oSc";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userProfile = null;
let chartAchatsInstance = null;
let chartVentesInstance = null;
let chartTendanceInstance = null; // NOUVEAU
let currentPeriod = "all";
let currentBarrelToAllocate = null;
let realtimeChannel = null;
let currentOrders = [];
let transactionLimit = 50;

const basePricesVente = {
  "Petit bois": 0.2,
  "Charbon Pauvre": 0.7,
  "Charbon Normale": 1.3,
  "Briquettes de Charbon": 3,
  "Coke de charbon": 6,
};
const basePricesAchat = {
  "Petit bois": 0.15,
  "Charbon Pauvre": 0.4,
  "Charbon Normale": 0.9,
  "Briquettes de Charbon": 1.5,
  "Coke de charbon": 3,
};
const typeColors = {
  "Petit bois": "#8B4513",
  "Charbon Pauvre": "#5a5a5a",
  "Charbon Normale": "#F5CBA7",
  "Briquettes de Charbon": "#2E8B57",
  "Coke de charbon": "#1E90FF",
  Salaire: "#8e44ad",
  "Location tonneau": "#d4af37",
  "Location four": "#e67e22",
  Ajustement: "#3b82f6",
  Divers: "#94A3B8",
};

// ==========================================
// --- GESTION DES THÈMES ---
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("scierie_theme") || "autumn";
  document.body.className = `theme-${savedTheme}`;
  const selector = document.getElementById("theme-selector");
  if (selector) selector.value = savedTheme;
}
function changeTheme(theme) {
  document.body.className = `theme-${theme}`;
  localStorage.setItem("scierie_theme", theme);
}
document.addEventListener("DOMContentLoaded", initTheme);

// ==========================================
// --- UI HELPERS & TOASTS ---
// ==========================================
function showPopup(title, message) {
  document.getElementById("popup-title").innerText = title;
  document.getElementById("popup-message").innerText = message;
  document.getElementById("custom-popup").style.display = "flex";
}
function closePopup() {
  document.getElementById("custom-popup").style.display = "none";
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  let icon = "fa-circle-info";
  if (type === "success") icon = "fa-check-circle";
  if (type === "warning") icon = "fa-triangle-exclamation";
  if (type === "danger") icon = "fa-circle-xmark";
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let confirmCallback = null;
function showConfirm(title, message, callback) {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-message").innerText = message;
  confirmCallback = callback;
  document.getElementById("confirm-modal").style.display = "flex";
}
function closeConfirm(result) {
  document.getElementById("confirm-modal").style.display = "none";
  if (result && confirmCallback) confirmCallback();
  confirmCallback = null;
}

function toggleAuth(type) {
  document.getElementById("login-form").style.display =
    type === "login" ? "block" : "none";
  document.getElementById("register-form").style.display =
    type === "register" ? "block" : "none";
}

function switchTab(tabId, btnElement) {
  document
    .querySelectorAll(".tab-content")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  if (btnElement) btnElement.classList.add("active");
  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("active");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}

function updateNavBadge(id, count) {
  const badge = document.getElementById(id);
  if (badge) {
    if (count > 0) {
      badge.style.display = "inline-block";
      badge.innerText = count;
    } else {
      badge.style.display = "none";
    }
  }
}

// ==========================================
// --- GESTION DES LOGS (AUDIT) ---
// ==========================================
async function addLog(actionType, details) {
  if (!userProfile) return;
  await db
    .from("logs")
    .insert({
      user_name: userProfile.full_name,
      action_type: actionType,
      details: details,
    });
}

async function loadLogs() {
  const tbody = document.getElementById("logs-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="4"><div class="skeleton skeleton-row"></div></td></tr>';
  const { data: logs } = await db
    .from("logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (logs && logs.length > 0) {
    tbody.innerHTML = "";
    logs.forEach((log) => {
      tbody.innerHTML += `<tr><td>${new Date(log.created_at).toLocaleString("fr-FR")}</td><td><strong>${log.user_name}</strong></td><td><span class="badge-type bg-blue" style="background:#3b82f6; color:white;">${log.action_type}</span></td><td>${log.details}</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Aucun log.</p></div></td></tr>`;
  }
}

// ==========================================
// --- COMMANDES ---
// ==========================================
function loadMoreTransactions() {
  transactionLimit += 50;
  loadPatronData();
}

function addOrderItemRow() {
  const container = document.getElementById("order-items-container");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "order-item-row";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginBottom = "8px";
  row.innerHTML = `
    <select class="order-item-select" onchange="updateOrderItemPrice(this)" style="flex: 2; min-width: 80px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
      <option value="Petit bois">Petit bois</option><option value="Charbon Pauvre">Charbon Pauvre</option><option value="Charbon Normale">Charbon Normale</option><option value="Briquettes de Charbon">Briquettes de Charbon</option><option value="Coke de charbon">Coke de charbon</option>
    </select>
    <input type="number" class="order-item-qty" placeholder="Qté" min="1" value="1" style="width: 50px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
    <input type="number" class="order-item-price" placeholder="Prix" step="0.01" value="0.2" style="width: 60px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
    <button type="button" onclick="this.parentElement.remove()" style="background: transparent; border: 1px solid var(--danger); color: var(--danger); padding: 8px 10px; cursor: pointer; border-radius: 4px;"><i class="fa-solid fa-trash"></i></button>`;
  container.appendChild(row);
  updateOrderItemPrice(row.querySelector(".order-item-select"));
}
function updateOrderItemPrice(selectElement) {
  const priceInput =
    selectElement.parentElement.querySelector(".order-item-price");
  priceInput.value = basePricesVente[selectElement.value] || 1;
}
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("order-items-container")) addOrderItemRow();
});

async function createOrder(e) {
  e.preventDefault();
  const client_name = document.getElementById("ord-client").value.trim();
  const deadline = document.getElementById("ord-deadline").value || null;
  const delivery_time =
    document.getElementById("ord-time").value.trim() || null;
  const note = document.getElementById("ord-note").value.trim() || null;
  const rows = document.querySelectorAll(".order-item-row");
  let items = [];
  rows.forEach((row) => {
    const item_type = row.querySelector(".order-item-select").value;
    const quantity = parseFloat(row.querySelector(".order-item-qty").value);
    const unit_price = parseFloat(row.querySelector(".order-item-price").value);
    if (quantity > 0) items.push({ item_type, quantity, unit_price });
  });
  if (items.length === 0)
    return showPopup("Erreur", "Ajoutez au moins un article.");
  const { error } = await db
    .from("orders")
    .insert({
      client_name,
      items,
      delivery_time,
      deadline,
      note,
      created_by: currentUser.id,
    });
  if (error) showPopup("Erreur", error.message);
  else {
    showToast("Commande créée !", "success");
    document.getElementById("order-form").reset();
    document.getElementById("order-items-container").innerHTML = "";
    addOrderItemRow();
    loadOrders();
    loadOrderRequirements();
  }
}

async function loadOrders() {
  const { data: orders } = await db
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const container = document.getElementById("orders-container");
  if (!container) return;
  currentOrders = orders || [];
  updateNavBadge("orders-count", orders ? orders.length : 0);

  if (orders && orders.length > 0) {
    container.innerHTML = "";
    orders.forEach((o) => {
      let orderItems = o.items || [];
      let itemsHtml = "";
      let totalGeneral = 0;
      let maxDate = o.deadline
        ? new Date(o.deadline).toLocaleDateString()
        : "Non spécifiée";
      let timeStr = o.delivery_time ? ` à ${o.delivery_time}` : "";
      let noteHtml = o.note
        ? `<div style="margin-top: 10px; padding: 8px; background: rgba(212, 175, 55, 0.1); border-left: 3px solid var(--primary); font-size: 0.85em; font-style: italic;"><i class="fa-solid fa-note-sticky"></i> ${o.note}</div>`
        : "";
      orderItems.forEach((item) => {
        const cost = item.quantity * item.unit_price;
        totalGeneral += cost;
        itemsHtml += `<div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding: 5px 0; font-size: 0.9em;"><span><strong style="color: ${typeColors[item.item_type] || "#888"};">${item.quantity}x</strong> ${item.item_type}</span><span style="color: var(--text-muted);">(${parseFloat(item.unit_price).toFixed(2)} S/u)</span></div>`;
      });
      container.innerHTML += `
        <div class="order-card" style="border-left-color: var(--primary); padding: 15px; margin-bottom: 15px;">
          <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
            <h4 style="margin: 0; color: var(--primary);">${o.client_name}</h4>
            <span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.8em;"><i class="fa-regular fa-clock"></i> ${maxDate}${timeStr}</span>
          </div>
          <div style="margin-bottom: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px;">
            ${itemsHtml}
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-weight: bold; font-family: 'Cinzel';"><span>TOTAL :</span><span style="color: var(--success);">${Math.round(totalGeneral)} S</span></div>
          </div>
          ${noteHtml}
          <div class="actions" style="display: flex; gap: 10px; margin-top: 15px;">
            <button class="btn-honor" style="flex: 1;" onclick='honorOrder("${o.id}", "${o.client_name}", ${JSON.stringify(orderItems).replace(/'/g, "&#39;")})'><i class="fa-solid fa-check"></i> Honorer</button>
            <button style="flex: 1; border: 1px solid var(--warning); color: var(--warning); background: transparent; border-radius: 4px; font-weight: 700; font-family: 'Cinzel'; cursor: pointer;" onclick="openEditOrderModal(${o.id})"><i class="fa-solid fa-pen"></i> Modifier</button>
            <button class="btn-cancel" style="flex: 1;" onclick="cancelOrder(${o.id})"><i class="fa-solid fa-xmark"></i> Annuler</button>
          </div>
        </div>`;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>Aucune commande.</p></div>`;
  }
}

async function honorOrder(id, client_name, itemsJson) {
  const items =
    typeof itemsJson === "string" ? JSON.parse(itemsJson) : itemsJson;
  for (const item of items) {
    const { data: stock } = await db
      .from("stocks")
      .select("quantity")
      .eq("item_name", item.item_type)
      .single();
    if (stock && stock.quantity < item.quantity)
      return showToast(`Stock insuffisant : ${item.item_type}`, "danger");
  }
  showConfirm("Honorer", `Déduire le stock pour ${client_name} ?`, async () => {
    const transactionsToInsert = items.map((item) => ({
      type: "vente",
      item_type: item.item_type,
      counterparty_name: client_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      created_by: currentUser.id,
    }));
    const { error: tErr } = await db
      .from("transactions")
      .insert(transactionsToInsert);
    if (tErr) return showPopup("Erreur", tErr.message);
    await db.from("orders").update({ status: "honored" }).eq("id", id);
    showToast("Commande honorée !", "success");
    loadOrders();
    loadOrderHistory();
    loadOrderRequirements();
    loadEmployeData();
    if (userProfile.role === "patron") {
      loadPatronData();
      loadTreasury();
    }
  });
}

async function cancelOrder(id) {
  showConfirm("Annuler", "Annuler cette commande ?", async () => {
    await db.from("orders").update({ status: "cancelled" }).eq("id", id);
    showToast("Commande annulée", "info");
    loadOrders();
    loadOrderHistory();
    loadOrderRequirements();
  });
}

async function loadOrderHistory() {
  const { data: orders } = await db
    .from("orders")
    .select("*")
    .neq("status", "pending")
    .order("created_at", { ascending: false });
  const tbody = document.getElementById("orders-history-body");
  if (!tbody) return;
  if (orders && orders.length > 0) {
    tbody.innerHTML = "";
    orders.forEach((o) => {
      let total = 0;
      let itemsText = (o.items || [])
        .map((i) => `${i.quantity}x ${i.item_type}`)
        .join(", ");
      (o.items || []).forEach((i) => (total += i.quantity * i.unit_price));
      const isHonored = o.status === "honored";
      const badge = isHonored
        ? `<span class="badge-type" style="color:white; background-color:var(--success);">Honorée</span>`
        : `<span class="badge-type" style="color:white; background-color:var(--danger);">Annulée</span>`;
      const actionBtn =
        userProfile.role === "patron"
          ? `<button class="btn-secondary" style="padding: 4px 8px; font-size: 0.8em;" onclick="restoreOrder(${o.id})"><i class="fa-solid fa-rotate-left"></i></button>`
          : "-";
      tbody.innerHTML += `<tr><td>${new Date(o.created_at).toLocaleDateString()}</td><td><strong>${o.client_name}</strong></td><td style="font-size: 0.85em;">${itemsText}</td><td style="color: var(--success); font-weight: bold;">${Math.round(total)} S</td><td>${badge}</td><td>${actionBtn}</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Aucune commande passée.</p></div></td></tr>`;
  }
}

async function restoreOrder(id) {
  showConfirm("Rétablir", "Remettre cette commande en attente ?", async () => {
    await db.from("orders").update({ status: "pending" }).eq("id", id);
    showToast("Commande rétablie !", "success");
    loadOrders();
    loadOrderHistory();
    loadOrderRequirements();
  });
}

// --- MODIFIER COMMANDE ---
function openEditOrderModal(id) {
  const order = currentOrders.find((o) => o.id === id);
  if (!order) return;
  document.getElementById("edit-ord-id").value = order.id;
  document.getElementById("edit-ord-client").value = order.client_name;
  document.getElementById("edit-ord-deadline").value = order.deadline || "";
  document.getElementById("edit-ord-time").value = order.delivery_time || "";
  document.getElementById("edit-ord-note").value = order.note || "";
  const container = document.getElementById("edit-order-items-container");
  container.innerHTML = "";
  let orderItems = order.items || [];
  if (orderItems.length > 0) orderItems.forEach((item) => addEditItemRow(item));
  else addEditItemRow();
  document.getElementById("edit-order-modal").style.display = "flex";
}

function addEditItemRow(itemData = null) {
  const container = document.getElementById("edit-order-items-container");
  const row = document.createElement("div");
  row.className = "edit-order-item-row";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginBottom = "8px";
  const itemVal = itemData ? itemData.item_type : "Petit bois";
  const qtyVal = itemData ? itemData.quantity : 1;
  const priceVal = itemData ? itemData.unit_price : 0.2;
  row.innerHTML = `
    <select class="edit-order-item-select" style="flex: 2; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
      <option value="Petit bois" ${itemVal === "Petit bois" ? "selected" : ""}>Petit bois</option><option value="Charbon Pauvre" ${itemVal === "Charbon Pauvre" ? "selected" : ""}>Charbon Pauvre</option><option value="Charbon Normale" ${itemVal === "Charbon Normale" ? "selected" : ""}>Charbon Normale</option><option value="Briquettes de Charbon" ${itemVal === "Briquettes de Charbon" ? "selected" : ""}>Briquettes de Charbon</option><option value="Coke de charbon" ${itemVal === "Coke de charbon" ? "selected" : ""}>Coke de charbon</option>
    </select>
    <input type="number" class="edit-order-item-qty" value="${qtyVal}" min="1" style="width: 50px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
    <input type="number" class="edit-order-item-price" step="0.01" value="${priceVal}" style="width: 60px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
    <button type="button" onclick="this.parentElement.remove()" style="background: transparent; border: 1px solid var(--danger); color: var(--danger); padding: 8px 10px; cursor: pointer; border-radius: 4px;"><i class="fa-solid fa-trash"></i></button>`;
  container.appendChild(row);
}

function closeEditOrderModal() {
  document.getElementById("edit-order-modal").style.display = "none";
}

async function saveEditedOrder() {
  const id = document.getElementById("edit-ord-id").value;
  const client_name = document.getElementById("edit-ord-client").value.trim();
  const deadline = document.getElementById("edit-ord-deadline").value || null;
  const delivery_time =
    document.getElementById("edit-ord-time").value.trim() || null;
  const note = document.getElementById("edit-ord-note").value.trim() || null;
  const rows = document.querySelectorAll(".edit-order-item-row");
  let items = [];
  rows.forEach((row) => {
    const item_type = row.querySelector(".edit-order-item-select").value;
    const quantity = parseFloat(
      row.querySelector(".edit-order-item-qty").value,
    );
    const unit_price = parseFloat(
      row.querySelector(".edit-order-item-price").value,
    );
    if (quantity > 0) items.push({ item_type, quantity, unit_price });
  });
  if (items.length === 0)
    return showPopup("Erreur", "Ajoutez au moins un article.");
  const { data, error } = await db
    .from("orders")
    .update({ client_name, deadline, delivery_time, note, items })
    .eq("id", id)
    .select();
  if (error) {
    showPopup("Erreur", error.message);
  } else if (!data || data.length === 0) {
    showPopup("Erreur", "Vérifiez les droits (RLS).");
  } else {
    showToast("Commande modifiée !", "success");
    closeEditOrderModal();
    loadOrders();
    loadOrderRequirements();
  }
}

// ==========================================
// --- BESOINS STOCK ---
// ==========================================
async function loadOrderRequirements() {
  const { data: orders } = await db
    .from("orders")
    .select("items")
    .eq("status", "pending");
  const { data: stocks } = await db
    .from("stocks")
    .select("item_name, quantity");
  const tbody = document.getElementById("order-requirements-body");
  if (!tbody) return;
  let requirements = {};
  if (stocks) stocks.forEach((s) => (requirements[s.item_name] = 0));
  if (orders) {
    orders.forEach((o) => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((item) => {
          if (!requirements[item.item_type]) requirements[item.item_type] = 0;
          requirements[item.item_type] += item.quantity;
        });
      }
    });
  }
  tbody.innerHTML = "";
  let hasRequirements = false;
  Object.keys(requirements).forEach((itemName) => {
    const needed = requirements[itemName];
    if (needed > 0) {
      hasRequirements = true;
      const stockItem = stocks.find((s) => s.item_name === itemName);
      const inStock = stockItem ? stockItem.quantity : 0;
      const projected = inStock - needed;
      let statusHtml =
        projected >= 0
          ? `<span class="text-success"><i class="fa-solid fa-check"></i> Suffisant</span>`
          : `<span class="text-danger"><i class="fa-solid fa-xmark"></i> Manque ${Math.abs(projected)}</span>`;
      const color = typeColors[itemName] || "#888";
      const textColor = itemName === "Charbon Normale" ? "#333" : "#fff";
      const badgeClass = projected >= 0 ? "positive" : "negative";
      tbody.innerHTML += `<tr><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${itemName}</span></td><td style="font-weight: bold; color: var(--warning);">${needed}</td><td style="font-weight: bold;">${inStock}</td><td><span class="badge-projete ${badgeClass}">${projected}</span></td><td>${statusHtml}</td></tr>`;
    }
  });
  if (!hasRequirements)
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-check-double"></i><p>Aucun besoin.</p></div></td></tr>`;
}

// ==========================================
// --- AUTH ---
// ==========================================
function changePeriod(val) {
  currentPeriod = val;
  loadPatronData();
}
function getFilteredTransactions(transactions) {
  if (currentPeriod === "all" || !transactions) return transactions || [];
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  return transactions.filter((t) => {
    const d = new Date(t.created_at);
    if (currentPeriod === "today") return t.created_at.startsWith(todayStr);
    if (currentPeriod === "week") return d >= sevenDaysAgo;
    if (currentPeriod === "month")
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    return true;
  });
}

async function register() {
  const pseudo = document.getElementById("reg-pseudo").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!pseudo || !password) return showPopup("Erreur", "Remplissez tout.");
  if (password.length < 6) return showPopup("Erreur", "6 caractères min.");
  const fakeEmail = `${pseudo.toLowerCase().replace(/\s+/g, "")}@example.com`;
  const { error } = await db.auth.signUp({
    email: fakeEmail,
    password,
    options: { data: { full_name: pseudo } },
  });
  if (error) return showPopup("Erreur", error.message);
  showPopup("Dossier Transmis", "En attente du Patron.");
  toggleAuth("login");
}

async function login() {
  const pseudo = document.getElementById("login-pseudo").value.trim();
  const password = document.getElementById("login-password").value;
  if (!pseudo || !password) return showPopup("Erreur", "Manquant.");
  const fakeEmail = `${pseudo.toLowerCase().replace(/\s+/g, "")}@example.com`;
  const { data, error } = await db.auth.signInWithPassword({
    email: fakeEmail,
    password,
  });
  if (error) return showPopup("Accès Refusé", "Incorrects.");
  currentUser = data.user;
  checkUserStatus();
}

async function logout() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  await db.auth.signOut();
  location.reload();
}

async function checkUserStatus() {
  let { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (!profile) {
    const nom =
      currentUser.user_metadata?.full_name || currentUser.email.split("@")[0];
    const { data: rpcData } = await db.rpc("creer_profil_auto", {
      user_id: currentUser.id,
      nom_utilisateur: nom,
    });
    profile = rpcData;
  }
  userProfile = profile;

  // BLOQUER LES UTILISATEURS VIRÉS
  if (profile.is_fired) {
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "none";
    document.getElementById("pending-screen").style.display = "none";
    document.body.innerHTML = `
      <div class="full-screen" style="display:flex;">
        <div class="auth-box text-center" style="border-top-color: var(--danger)">
          <i class="fa-solid fa-ban fa-3x" style="color: var(--danger); margin-bottom: 20px;"></i>
          <h2 style="color: var(--danger)">Accès Révoqué</h2>
          <p style="margin-bottom: 20px; color: var(--text-muted)">Vous avez été renvoyé de la Scierie par le Patron.</p>
          <button class="btn-secondary" onclick="logout()">Quitter</button>
        </div>
      </div>
    `;
    return;
  }

  document.getElementById("user-display-name").innerText = profile.full_name;
  let roleText = "Employé";
  if (profile.role === "patron") roleText = "Patron";
  if (profile.role === "contremaitre") roleText = "Contremaître";
  document.getElementById("user-role-badge").innerText = roleText;

  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("pending-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";

  if (profile.role === "patron") {
    document.getElementById("nav-gestion").style.display = "flex";
    document.getElementById("nav-location").style.display = "flex";
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "none";
    document.getElementById("nav-logs").style.display = "flex";
    const treasuryCard = document.getElementById("treasury-card");
    if (treasuryCard) treasuryCard.style.display = "block";
    switchTab("tab-gestion", document.getElementById("nav-gestion"));
    loadPatronData();
    loadBarrels();
    loadFurnaces();
    loadEmployeData();
    loadLogs();
  } else if (profile.role === "contremaitre") {
    if (!profile.is_approved) {
      document.getElementById("app-screen").style.display = "none";
      document.getElementById("pending-screen").style.display = "flex";
      return;
    }
    document.getElementById("nav-gestion").style.display = "none";
    document.getElementById("nav-location").style.display = "flex";
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "flex";
    document.getElementById("nav-logs").style.display = "none";
    const treasuryCard = document.getElementById("treasury-card");
    if (treasuryCard) treasuryCard.style.display = "none";
    switchTab("tab-commandes", document.querySelector(".nav-btn"));
    loadBarrels();
    loadFurnaces();
    loadEmployeData();
  } else {
    if (!profile.is_approved) {
      document.getElementById("app-screen").style.display = "none";
      document.getElementById("pending-screen").style.display = "flex";
      return;
    }
    document.getElementById("nav-gestion").style.display = "none";
    document.getElementById("nav-location").style.display = "none";
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "flex";
    document.getElementById("nav-logs").style.display = "none";
    const treasuryCard = document.getElementById("treasury-card");
    if (treasuryCard) treasuryCard.style.display = "none";
    switchTab("tab-commandes", document.querySelector(".nav-btn"));
    loadFurnaces();
    loadEmployeData();
  }
  loadStock();
  loadTreasury();
  loadOrders();
  loadOrderHistory();
  loadOrderRequirements();
  updateBasePrice();
  setupRealtime();
}

// ==========================================
// --- TRESORERIE & STOCK ---
// ==========================================
async function loadTreasury() {
  if (!userProfile || userProfile.role !== "patron") return;
  const { data: transactions } = await db.from("transactions").select("*");
  if (!transactions) return;
  let tA = 0,
    tV = 0,
    tS = 0,
    tAj = 0;
  transactions.forEach((t) => {
    const c = t.quantity * t.unit_price;
    if (t.type === "achat") tA += c;
    else if (t.type === "salaire") tS += c;
    else if (t.type === "vente") tV += c;
    else if (t.type === "ajustement") tAj += c;
  });
  const el = document.getElementById("current-treasury");
  if (el) el.value = Math.floor(tV - tA - tS + tAj);
}
async function updateTreasuryDirect(input) {
  const newValue = parseInt(input.value);
  if (isNaN(newValue) || newValue < 0) return loadTreasury();
  const { data: transactions } = await db.from("transactions").select("*");
  let tA = 0,
    tV = 0,
    tS = 0,
    tAj = 0;
  transactions.forEach((t) => {
    const c = t.quantity * t.unit_price;
    if (t.type === "achat") tA += c;
    else if (t.type === "salaire") tS += c;
    else if (t.type === "vente") tV += c;
    else if (t.type === "ajustement") tAj += c;
  });
  const diff = newValue - Math.floor(tV - tA - tS + tAj);
  if (diff === 0) return;
  showConfirm(
    "Modification",
    `Ajuster de ${diff > 0 ? "+" : ""}${diff} S ?`,
    async () => {
      const { error } = await db
        .from("transactions")
        .insert({
          type: "ajustement",
          item_type: "Ajustement",
          counterparty_name: "Direct",
          quantity: 1,
          unit_price: diff,
          created_by: currentUser.id,
        });
      if (error) {
        showPopup("Erreur", error.message);
        loadTreasury();
      } else {
        await addLog("Trésorerie", `Ajustement de ${diff} S.`);
        showToast("Ajusté", "success");
        loadTreasury();
        loadPatronData();
      }
    },
  );
}
async function adjustTreasury(type) {
  const amount = parseInt(document.getElementById("manual-amount").value);
  if (!amount || amount <= 0) return showPopup("Erreur", "Invalide.");
  const action = type === 1 ? "Ajouter" : "Retirer";
  showConfirm(
    `Ajustement`,
    `Voulez-vous ${action.toLowerCase()} ${amount} S ?`,
    async () => {
      const { error } = await db
        .from("transactions")
        .insert({
          type: "ajustement",
          item_type: "Ajustement",
          counterparty_name: `Manuel`,
          quantity: 1,
          unit_price: type === 1 ? amount : -amount,
          created_by: currentUser.id,
        });
      if (error) showPopup("Erreur", error.message);
      else {
        await addLog("Trésorerie", `${action} de ${amount} S.`);
        showToast(`${amount} S ${action.toLowerCase()}s.`, "success");
        document.getElementById("manual-amount").value = "";
        loadTreasury();
        loadPatronData();
      }
    },
  );
}

async function loadStock() {
  const { data: stocks, error } = await db
    .from("stocks")
    .select("*")
    .order("id");
  const { data: orders } = await db
    .from("orders")
    .select("items")
    .eq("status", "pending");
  let requirements = {};
  if (orders)
    orders.forEach((o) => {
      if (o.items)
        o.items.forEach((item) => {
          requirements[item.item_type] =
            (requirements[item.item_type] || 0) + item.quantity;
        });
    });
  const container = document.getElementById("stock-container");
  if (!container) return;
  container.innerHTML = "";
  if (error) {
    container.innerHTML = `<p class="text-danger">Erreur.</p>`;
    return;
  }
  if (stocks && stocks.length > 0) {
    stocks.forEach((s) => {
      const color = typeColors[s.item_name] || "#888";
      const needed = requirements[s.item_name] || 0;
      const projected = s.quantity - needed;
      let projectedHtml =
        needed > 0
          ? `<div class="badge-projete ${projected >= 0 ? "positive" : "negative"}">Projeté : ${projected}</div>`
          : `<div class="badge-projete neutral">Projeté : ${projected}</div>`;
      const controls =
        userProfile.role === "patron"
          ? `<div class="stock-controls"><input type="number" id="stock-qty-${s.id}" placeholder="Qté" min="1"><div class="stock-buttons"><button class="btn-add" onclick="adjustStock(${s.id}, ${s.quantity}, 1, '${s.item_name}')"><i class="fa-solid fa-plus"></i></button><button class="btn-sub" onclick="adjustStock(${s.id}, ${s.quantity}, -1, '${s.item_name}')"><i class="fa-solid fa-minus"></i></button></div></div>`
          : "";
      container.innerHTML += `<div class="stock-item" style="border-left-color: ${color};"><h4 style="background-color: ${color}; color: ${s.item_name === "Charbon Normale" ? "#333" : "#fff"};">${s.item_name}</h4><div class="qty">${s.quantity}</div>${projectedHtml}${controls}</div>`;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><p>Stock vide.</p></div>`;
  }
}

async function adjustStock(id, currentQty, op, itemName) {
  const input = document.getElementById(`stock-qty-${id}`);
  const amount = parseInt(input.value);
  if (!amount || amount <= 0) return showPopup("Erreur", "Qté invalide.");
  let newQty = op === 1 ? currentQty + amount : currentQty - amount;
  if (newQty < 0) newQty = 0;
  await db.from("stocks").update({ quantity: newQty }).eq("id", id);
  await addLog("Stock", `A modifié ${itemName} de ${currentQty} à ${newQty}.`);
  input.value = "";
  loadStock();
}

function updateBasePrice() {
  const type = document.getElementById("emp-type").value;
  const select = document.getElementById("emp-item");
  const item = select.value;
  const customRow = document.getElementById("custom-item-row");
  if (item === "Divers") {
    customRow.style.display = "flex";
    document.getElementById("emp-price").value = "";
  } else {
    customRow.style.display = "none";
    let price =
      type === "vente" ? basePricesVente[item] : basePricesAchat[item];
    document.getElementById("emp-price").value = price;
  }
  select.style.backgroundColor = typeColors[item] || "#333";
  select.style.color = item === "Charbon Normale" ? "#333" : "#fff";
  calcEmpTotal();
}
document.getElementById("emp-quantity").addEventListener("input", calcEmpTotal);
document.getElementById("emp-price").addEventListener("input", calcEmpTotal);

function calcEmpTotal() {
  const q = parseFloat(document.getElementById("emp-quantity").value) || 0;
  const p = parseFloat(document.getElementById("emp-price").value) || 0;
  document.getElementById("emp-total").value = (q * p).toFixed(2) + " S";

  const type = document.getElementById("emp-type").value;
  const item = document.getElementById("emp-item").value;
  const indicator = document.getElementById("margin-indicator");

  if (item === "Divers" || !basePricesVente[item] || !basePricesAchat[item]) {
    indicator.style.display = "none";
    return;
  }
  indicator.style.display = "block";
  const achatStandard = basePricesAchat[item];

  if (type === "vente") {
    const diff = p - achatStandard;
    const percent = (diff / achatStandard) * 100;
    if (percent > 0) {
      indicator.style.background = "rgba(46, 125, 50, 0.2)";
      indicator.style.color = "var(--success)";
      indicator.style.border = "1px solid var(--success)";
      indicator.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> Bénéfice : +${percent.toFixed(0)}% (Basé sur l'achat à ${achatStandard} S)`;
    } else if (percent < 0) {
      indicator.style.background = "rgba(198, 40, 40, 0.2)";
      indicator.style.color = "var(--danger)";
      indicator.style.border = "1px solid var(--danger)";
      indicator.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> Perte : ${percent.toFixed(0)}% (En dessous du prix d'achat de ${achatStandard} S)`;
    } else {
      indicator.style.background = "rgba(255, 255, 255, 0.05)";
      indicator.style.color = "var(--text-muted)";
      indicator.style.border = "1px solid var(--border)";
      indicator.innerHTML = `<i class="fa-solid fa-equals"></i> Prix d'achat exact (0% de bénéfice)`;
    }
  } else {
    const diff = p - achatStandard;
    if (diff <= 0) {
      indicator.style.background = "rgba(46, 125, 50, 0.2)";
      indicator.style.color = "var(--success)";
      indicator.style.border = "1px solid var(--success)";
      indicator.innerHTML = `<i class="fa-solid fa-check"></i> Bon achat (Prix ≤ ${achatStandard} S)`;
    } else {
      indicator.style.background = "rgba(198, 40, 40, 0.2)";
      indicator.style.color = "var(--danger)";
      indicator.style.border = "1px solid var(--danger)";
      indicator.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Achat cher (Au-dessus du prix standard de ${achatStandard} S)`;
    }
  }
}

async function addTransaction(e) {
  e.preventDefault();
  const type = document.getElementById("emp-type").value;
  let item_type = document.getElementById("emp-item").value;
  const quantity = parseFloat(document.getElementById("emp-quantity").value);
  const unit_price = parseFloat(document.getElementById("emp-price").value);
  if (item_type === "Divers") {
    const customName = document.getElementById("emp-custom-item").value.trim();
    if (!customName) return showPopup("Erreur", "Précisez l'achat.");
    item_type = customName;
  }
  if (type === "vente" && item_type !== "Divers") {
    const { data: stock } = await db
      .from("stocks")
      .select("quantity")
      .eq("item_name", item_type)
      .single();
    if (stock && stock.quantity < quantity)
      return showToast(`Stock insuffisant : ${item_type}`, "danger");
  }
  const { error } = await db
    .from("transactions")
    .insert({
      type,
      item_type,
      counterparty_name: userProfile.full_name,
      quantity,
      unit_price,
      created_by: currentUser.id,
    });
  if (error) showPopup("Erreur", error.message);
  else {
    showToast("Enregistré !", "success");
    document.getElementById("emp-custom-item").value = "";
    document.getElementById("emp-quantity").value = 1;
    loadEmployeData();
    if (type !== "Divers") loadStock();
    if (userProfile.role === "patron") {
      loadPatronData();
      loadTreasury();
    }
  }
}

// ==========================================
// --- PATRON DATA (DASHBOARD) ---
// ==========================================
async function loadPatronData() {
  // 1. Récupérer le personnel (filtré)
  const { data: allPersonnel, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  const personnel = allPersonnel
    ? allPersonnel.filter((p) => p.is_fired !== true)
    : null;

  const personnelDiv = document.getElementById("admin-personnel-list");
  const salDiv = document.getElementById("admin-salaries-list");
  if (!personnelDiv || !salDiv) return;

  if (error) {
    personnelDiv.innerHTML = `<p class="text-danger">Erreur.</p>`;
  } else if (!personnel || personnel.length === 0) {
    personnelDiv.innerHTML = `<div class="empty-state"><p>Aucun employé.</p></div>`;
  } else {
    personnelDiv.innerHTML = "";
    salDiv.innerHTML = "";
    personnel.forEach((p) => {
      const isMe = p.id === currentUser.id;
      let act = "";
      if (p.is_approved)
        act = `<button class="btn-action btn-fire" onclick="event.stopPropagation(); virerUtilisateur('${p.id}', '${p.full_name}')" ${isMe ? "disabled" : ""}><i class="fa-solid fa-trash"></i></button>`;
      else
        act = `<button class="btn-action btn-validate" onclick="event.stopPropagation(); validerUtilisateur('${p.id}')"><i class="fa-solid fa-check"></i></button><button class="btn-action btn-fire" onclick="event.stopPropagation(); virerUtilisateur('${p.id}', '${p.full_name}')"><i class="fa-solid fa-trash"></i></button>`;
      if (p.is_approved && p.role === "employe" && !isMe)
        act =
          `<button class="btn-action btn-contremaitre" onclick="event.stopPropagation(); changerRole('${p.id}', 'contremaitre')"><i class="fa-solid fa-hard-hat"></i></button>` +
          act;
      if (p.is_approved && p.role === "contremaitre" && !isMe)
        act =
          `<button class="btn-action btn-secondary" onclick="event.stopPropagation(); changerRole('${p.id}', 'employe')"><i class="fa-solid fa-arrow-down"></i></button>` +
          act;
      if (p.role === "employe" && p.is_approved && !isMe)
        act =
          `<button class="btn-action btn-promote" onclick="event.stopPropagation(); changerRole('${p.id}', 'patron')"><i class="fa-solid fa-crown"></i></button>` +
          act;

      let rB = "Employé",
        bC = "var(--text-muted)";
      if (p.role === "patron") {
        rB = "Patron";
        bC = "var(--primary)";
      }
      if (p.role === "contremaitre") {
        rB = "Contremaitre";
        bC = "#3498db";
      }
      const sB = p.is_approved
        ? ""
        : '<span style="color:var(--danger);">(En attente)</span>';
      personnelDiv.innerHTML += `<div class="personnel-row" style="cursor:pointer;" onclick="showUserHistory('${p.id}', '${p.full_name}')"><div class="personnel-info"><strong>${p.full_name} ${isMe ? "(Vous)" : ""}</strong><span>Rôle : <span style="color:${bC};">${rB}</span> ${sB}</span></div><div class="personnel-actions">${act}</div></div>`;
      if (p.is_approved)
        salDiv.innerHTML += `<div class="salary-row"><span>${p.full_name}</span><input type="number" value="${p.salary || 0}" id="sal-amount-${p.id}" oninput="updateSalaryTotal()" placeholder="0" step="1"></div>`;
    });
    if (salDiv.innerHTML === "")
      salDiv.innerHTML = `<div class="empty-state"><p>Aucun employé validé.</p></div>`;
  }
  updateSalaryTotal();

  // Mise à jour KPI Employés
  const kpiEmployes = document.getElementById("kpi-employes");
  if (kpiEmployes && personnel)
    kpiEmployes.innerText = personnel.filter((p) => p.is_approved).length;

  // Mise à jour KPI Tonneaux Occupés
  const { data: rentals } = await db.from("barrel_rentals").select("id");
  const kpiBarrels = document.getElementById("kpi-barrels");
  if (kpiBarrels && rentals) kpiBarrels.innerText = `${rentals.length} / 23`;

  // 2. Récupérer les transactions
  const { data: globalT } = await db
    .from("transactions")
    .select(
      "id, quantity, unit_price, type, created_at, item_type, counterparty_name",
    )
    .order("created_at", { ascending: false });
  const allT = globalT ? globalT.slice(0, transactionLimit) : [];
  const filtered = getFilteredTransactions(globalT);
  const displayFiltered = getFilteredTransactions(allT);

  // 3. Calculer les KPIs du MOIS
  let caMois = 0,
    depMois = 0;
  const now = new Date();
  if (globalT) {
    globalT.forEach((t) => {
      const d = new Date(t.created_at);
      if (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      ) {
        const cost = t.quantity * t.unit_price;
        if (t.type === "vente") caMois += cost;
        if (t.type === "achat" || t.type === "salaire") depMois += cost;
      }
    });
  }
  const kpiCa = document.getElementById("kpi-ca");
  const kpiProfit = document.getElementById("kpi-profit");
  if (kpiCa) kpiCa.innerText = Math.round(caMois) + " S";
  if (kpiProfit) {
    const profit = caMois - depMois;
    kpiProfit.innerText = Math.round(profit) + " S";
    kpiProfit.style.color = profit >= 0 ? "var(--success)" : "var(--danger)";
  }

  // 4. Remplir le tableau
  const tbody = document.getElementById("admin-history-body");
  if (displayFiltered && displayFiltered.length > 0) {
    tbody.innerHTML = "";
    displayFiltered.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let bC = "bg-secondary",
        tC = "text-muted";
      if (t.type === "vente") {
        bC = "bg-green";
        tC = "text-success";
      }
      if (t.type === "achat") {
        bC = "bg-red";
        tC = "text-danger";
      }
      if (t.type === "salaire") {
        bC = "bg-purple";
        tC = "text-danger";
      }
      if (t.type === "ajustement") {
        bC = "bg-blue";
        tC = cost >= 0 ? "text-success" : "text-danger";
      }
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td>${t.counterparty_name}</td><td><span class="badge-type ${bC}" style="${t.type === "ajustement" ? "background-color: #3b82f6; color: white;" : ""}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${tC}">${Math.round(cost)} S</td><td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
    const btnLoadMore = document.getElementById("btn-load-more");
    if (globalT && globalT.length > transactionLimit)
      btnLoadMore.style.display = "inline-block";
    else btnLoadMore.style.display = "none";
  } else {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Aucune transaction.</p></div></td></tr>`;
    document.getElementById("btn-load-more").style.display = "none";
  }

  // Anciens Stats (suivant le filtre de période)
  let tA = 0,
    tV = 0,
    tS = 0;
  filtered.forEach((t) => {
    const cost = t.quantity * t.unit_price;
    if (t.type === "achat") tA += cost;
    else if (t.type === "salaire") tS += cost;
    else if (t.type === "vente") tV += cost;
  });
  const tD = tA + tS;
  document.getElementById("stat-ventes").innerText = Math.round(tV) + " S";
  document.getElementById("stat-achats").innerText = Math.round(tD) + " S";
  const b = tV - tD;
  const eB = document.getElementById("stat-benefice");
  eB.innerText = Math.round(b) + " S";
  eB.className = b >= 0 ? "text-success" : "text-danger";

  // Recherche & Tri
  const searchInput = document.getElementById("search-tx");
  const sortInput = document.getElementById("sort-tx");
  if (searchInput && sortInput) {
    const query = searchInput.value.toLowerCase().trim();
    const sortOrder = sortInput.value;
    let finalTransactions = displayFiltered.filter(
      (t) =>
        t.counterparty_name.toLowerCase().includes(query) ||
        t.item_type.toLowerCase().includes(query) ||
        t.type.toLowerCase().includes(query),
    );
    finalTransactions.sort((a, b) => {
      const costA = a.quantity * a.unit_price;
      const costB = b.quantity * b.unit_price;
      if (sortOrder === "price-desc") return costB - costA;
      if (sortOrder === "price-asc") return costA - costB;
      if (sortOrder === "date-asc")
        return new Date(a.created_at) - new Date(b.created_at);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    tbody.innerHTML = "";
    if (finalTransactions.length > 0) {
      finalTransactions.forEach((t) => {
        const cost = t.quantity * t.unit_price;
        const color = typeColors[t.item_type] || "#888";
        const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
        let bC = "bg-secondary",
          tC = "text-muted";
        if (t.type === "vente") {
          bC = "bg-green";
          tC = "text-success";
        }
        if (t.type === "achat") {
          bC = "bg-red";
          tC = "text-danger";
        }
        if (t.type === "salaire") {
          bC = "bg-purple";
          tC = "text-danger";
        }
        if (t.type === "ajustement") {
          bC = "bg-blue";
          tC = cost >= 0 ? "text-success" : "text-danger";
        }
        tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td>${t.counterparty_name}</td><td><span class="badge-type ${bC}" style="${t.type === "ajustement" ? "background-color: #3b82f6; color: white;" : ""}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${tC}">${Math.round(cost)} S</td><td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td></tr>`;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Aucun résultat pour "${query}".</p></div></td></tr>`;
    }
  }

  renderCharts(filtered, globalT); // On passe globalT pour la courbe
}

// ==========================================
// --- GRAPHIQUES (CAMEMBERT + COURBE) ---
// ==========================================
function renderCharts(transactions, allTransactions) {
  // --- 1. CAMEMBERT (Achats/Ventes) ---
  let achats = {};
  let ventes = {};
  transactions.forEach((t) => {
    const cost = t.quantity * t.unit_price;
    if (t.type === "achat") {
      const isStandardItem = [
        "Petit bois",
        "Charbon Pauvre",
        "Charbon Normale",
        "Briquettes de Charbon",
        "Coke de charbon",
      ].includes(t.item_type);
      achats[isStandardItem ? t.item_type : "Divers"] =
        (achats[isStandardItem ? t.item_type : "Divers"] || 0) + cost;
    } else if (t.type === "vente") {
      ventes[t.item_type] = (ventes[t.item_type] || 0) + cost;
    }
  });
  const labelsAchats = Object.keys(achats).filter((k) => achats[k] > 0);
  const dataAchats = labelsAchats.map((k) => achats[k]);
  const labelsVentes = Object.keys(ventes).filter((k) => ventes[k] > 0);
  const dataVentes = labelsVentes.map((k) => ventes[k]);

  if (chartAchatsInstance) chartAchatsInstance.destroy();
  if (chartVentesInstance) chartVentesInstance.destroy();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#94A3B8",
          font: { family: "Inter", size: 11 },
          padding: 10,
          boxWidth: 10,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
    },
  };
  const getColor = (label) => {
    if (typeColors[label]) return typeColors[label];
    if (label === "Divers") return "#94A3B8";
    let hash = 0;
    for (let i = 0; i < label.length; i++)
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 60%, 50%)`;
  };

  const ctxA = document.getElementById("chart-achats").getContext("2d");
  if (labelsAchats.length === 0) {
    chartAchatsInstance = new Chart(ctxA, {
      type: "doughnut",
      data: {
        labels: ["Aucun achat"],
        datasets: [{ data: [1], backgroundColor: ["#2A2A35"], borderWidth: 0 }],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
  } else {
    chartAchatsInstance = new Chart(ctxA, {
      type: "doughnut",
      data: {
        labels: labelsAchats,
        datasets: [
          {
            data: dataAchats,
            backgroundColor: labelsAchats.map((l) => getColor(l)),
            borderWidth: 0,
            cutout: "60%",
          },
        ],
      },
      options: commonOptions,
    });
  }

  const ctxV = document.getElementById("chart-ventes").getContext("2d");
  if (labelsVentes.length === 0) {
    chartVentesInstance = new Chart(ctxV, {
      type: "doughnut",
      data: {
        labels: ["Aucune vente"],
        datasets: [{ data: [1], backgroundColor: ["#2A2A35"], borderWidth: 0 }],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
  } else {
    chartVentesInstance = new Chart(ctxV, {
      type: "doughnut",
      data: {
        labels: labelsVentes,
        datasets: [
          {
            data: dataVentes,
            backgroundColor: labelsVentes.map((l) => getColor(l)),
            borderWidth: 0,
            cutout: "60%",
          },
        ],
      },
      options: commonOptions,
    });
  }

  // --- 2. COURBE DE TENDANCE (30 JOURS) ---
  if (chartTendanceInstance) chartTendanceInstance.destroy();

  // Préparer les 30 derniers jours
  const last30Days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last30Days.push(d.toISOString().split("T")[0]);
  }

  const dailyVentes = new Array(30).fill(0);
  const dailyAchats = new Array(30).fill(0);

  if (allTransactions) {
    allTransactions.forEach((t) => {
      const day = t.created_at.split("T")[0];
      const index = last30Days.indexOf(day);
      if (index !== -1) {
        const cost = t.quantity * t.unit_price;
        if (t.type === "vente") dailyVentes[index] += cost;
        if (t.type === "achat" || t.type === "salaire")
          dailyAchats[index] += cost;
      }
    });
  }

  const ctxT = document.getElementById("chart-tendance").getContext("2d");

  // Gradient pour faire joli
  let gradientBleu = ctxT.createLinearGradient(0, 0, 0, 400);
  gradientBleu.addColorStop(0, "rgba(46, 125, 50, 0.5)");
  gradientBleu.addColorStop(1, "rgba(46, 125, 50, 0.0)");

  let gradientRouge = ctxT.createLinearGradient(0, 0, 0, 400);
  gradientRouge.addColorStop(0, "rgba(198, 40, 40, 0.5)");
  gradientRouge.addColorStop(1, "rgba(198, 40, 40, 0.0)");

  chartTendanceInstance = new Chart(ctxT, {
    type: "line",
    data: {
      labels: last30Days.map((d) => {
        const [y, m, day] = d.split("-");
        return `${day}/${m}`;
      }),
      datasets: [
        {
          label: "Ventes (S)",
          data: dailyVentes,
          borderColor: "var(--success)",
          backgroundColor: gradientBleu,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: "var(--success)",
          pointRadius: 3,
        },
        {
          label: "Dépenses (S)",
          data: dailyAchats,
          borderColor: "var(--danger)",
          backgroundColor: gradientRouge,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: "var(--danger)",
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#94A3B8", font: { family: "Inter" } } },
      },
      scales: {
        x: {
          ticks: { color: "#94A3B8", maxTicksLimit: 10 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#94A3B8" },
          grid: { color: "rgba(255,255,255,0.05)" },
          beginAtZero: true,
        },
      },
    },
  });
}

// ==========================================
// --- UTILS PATRON & AUTRES ---
// ==========================================
async function showUserHistory(userId, userName) {
  document.getElementById("user-history-title").innerText =
    `Historique de ${userName}`;
  document.getElementById("user-history-body").innerHTML =
    '<tr><td colspan="6"><div class="skeleton skeleton-row"></div></td></tr>';
  document.getElementById("user-history-modal").style.display = "flex";
  const { data: transactions } = await db
    .from("transactions")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const tbody = document.getElementById("user-history-body");
  if (transactions && transactions.length > 0) {
    tbody.innerHTML = "";
    transactions.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let bC =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") bC = "bg-blue";
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td><span class="badge-type ${bC}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Aucune transaction.</p></div></td></tr>`;
  }
}
function closeUserHistory() {
  document.getElementById("user-history-modal").style.display = "none";
}

function updateSalaryTotal() {
  let total = 0;
  document.querySelectorAll('[id^="sal-amount-"]').forEach((input) => {
    total += parseFloat(input.value) || 0;
  });
  const display = document.getElementById("salary-total-display");
  if (display) display.innerText = Math.floor(total) + " S";
}

async function validerUtilisateur(id) {
  await db.from("profiles").update({ is_approved: true }).eq("id", id);
  showToast("Validé !", "success");
  loadPatronData();
}
async function changerRole(id, role) {
  showConfirm("Changement", `Nommer ${role} ?`, async () => {
    await db.from("profiles").update({ role: role }).eq("id", id);
    showToast("Rôle mis à jour.", "success");
    loadPatronData();
  });
}

async function virerUtilisateur(id, nom) {
  showConfirm("Virer", `Révoquer l'accès de ${nom} ?`, async () => {
    const { error } = await db.rpc("supprimer_utilisateur", {
      target_user_id: id,
    });
    if (error) {
      console.error(error);
      showToast(`Erreur : ${error.message}`, "danger");
    } else {
      showToast(`${nom} a été révoqué.`, "info");
      loadPatronData();
    }
  });
}

async function deleteTransaction(id) {
  showConfirm("Supprimer", "Supprimer cette transaction ?", async () => {
    await db.from("transactions").delete().eq("id", id);
    showToast("Supprimée", "info");
    loadPatronData();
    loadEmployeData();
    loadTreasury();
  });
}

async function paySalaries() {
  const inputs = document.querySelectorAll('[id^="sal-amount-"]');
  if (inputs.length === 0) return showPopup("Info", "Aucun employé.");
  let totalPaye = 0,
    tI = [],
    u = [];
  for (const input of inputs) {
    const id = input.id.replace("sal-amount-", "");
    const salary = parseInt(input.value) || 0;
    if (salary > 0) {
      const nom = input.closest(".salary-row").querySelector("span").innerText;
      totalPaye += salary;
      u.push({ id, salary });
      tI.push({
        type: "salaire",
        item_type: "Salaire",
        counterparty_name: nom,
        quantity: 1,
        unit_price: salary,
        created_by: currentUser.id,
      });
    }
  }
  if (totalPaye === 0) return showPopup("Info", "Total à 0.");
  showConfirm(
    "Payer",
    `Confirmer le paiement de ${totalPaye} S ?`,
    async () => {
      for (const up of u)
        await db.from("profiles").update({ salary: up.salary }).eq("id", up.id);
      await db.from("transactions").insert(tI);
      showToast(`${totalPaye} S distribués.`, "success");
      loadPatronData();
      loadEmployeData();
      loadTreasury();
    },
  );
}

async function loadBarrels() {
  const { data: rentals } = await db.from("barrel_rentals").select("*");
  const container = document.querySelector("#tab-location .barrels-grid");
  if (!container) return;
  if (
    container.innerHTML.trim() === "" ||
    container.innerHTML.includes("skeleton")
  ) {
    container.innerHTML = "";
    for (let i = 1; i <= 23; i++)
      container.innerHTML += `<div class="barrel-card free" id="barrel-${i}"><div class="barrel-header"><h3>Tonneau n°${i}</h3><span class="status-badge">Libre</span></div><div class="barrel-body"><div class="client-name"></div><div class="pay-info"></div></div><div class="barrel-actions"><button class="btn-allocate" onclick="allocateBarrel(${i})">Allouer</button></div></div>`;
  }

  let lateCount = 0;
  for (let i = 1; i <= 23; i++) {
    const card = document.getElementById(`barrel-${i}`);
    if (!card) continue;
    const rental = rentals ? rentals.find((r) => r.barrel_number === i) : null;
    card.className = "barrel-card free";
    const sE = card.querySelector(".status-badge"),
      cE = card.querySelector(".client-name"),
      pE = card.querySelector(".pay-info"),
      aE = card.querySelector(".barrel-actions");

    if (rental) {
      cE.innerHTML = `<i class="fa-solid fa-user"></i> ${rental.client_name}`;
      let pH = `<div class="barrel-price-container"><span style="color: var(--text-muted); font-size: 0.9em;">Prix :</span> <div style="display:flex; align-items:center; gap:5px;"><span style="color: var(--primary); font-weight: bold; font-family: 'Cinzel';">${rental.price || 50}</span><span style="color: var(--primary); font-weight: bold;">S</span></div></div>`;
      if (userProfile.role === "patron")
        pH = `<div class="barrel-price-container" onclick="this.querySelector('input').focus()"><span style="color: var(--text-muted); font-size: 0.9em;">Prix :</span> <div style="display:flex; align-items:center; gap:5px;"><input type="number" class="barrel-price-input" value="${rental.price || 50}" onchange="updateBarrelPrice(${rental.id}, this.value, ${i})"><span style="color: var(--primary); font-weight: bold;">S</span><i class="fa-solid fa-pen" style="color: var(--text-muted); font-size: 0.8em; margin-left: 5px;"></i></div></div>`;

      if (rental.last_payment_date) {
        const lP = new Date(rental.last_payment_date),
          nP = new Date(lP);
        nP.setDate(nP.getDate() + 7);
        const dD = Math.ceil(
          (nP.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        const o = { day: "2-digit", month: "2-digit", year: "numeric" };
        if (dD < 0) {
          card.classList.add("late");
          sE.innerText = "En retard";
          lateCount++;
          pE.innerHTML = `${pH}<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Dû le : ${nP.toLocaleDateString("fr-FR", o)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(dD)}j</span>`;
        } else {
          card.classList.add("paid");
          sE.innerText = "À jour";
          pE.innerHTML = `${pH}<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Prochain : <strong>${nP.toLocaleDateString("fr-FR", o)}</strong></span><span>Dans ${dD}j</span>`;
        }
      } else {
        card.classList.add("late");
        sE.innerText = "Jamais payé";
        lateCount++;
        pE.innerHTML = `${pH}<span style="color: var(--danger);">Aucun paiement</span>`;
      }
      aE.innerHTML = `<button class="btn-pay" onclick="payBarrel(${rental.id}, ${i}, '${rental.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser</button><button class="btn-free" onclick="freeBarrel(${rental.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
    } else {
      cE.innerHTML = "";
      pE.innerHTML = "";
      sE.innerText = "Libre";
      aE.innerHTML = `<button class="btn-allocate" onclick="allocateBarrel(${i})"><i class="fa-solid fa-plus"></i> Allouer</button>`;
    }
  }
  updateNavBadge("nav-location-badge", lateCount);
}

function allocateBarrel(num) {
  currentBarrelToAllocate = num;
  document.getElementById("allocate-barrel-title").innerText =
    `Tonneau n°${num}`;
  document.getElementById("allocate-client-name").value = "";
  document.getElementById("allocate-price").value = 50;
  document.getElementById("allocate-barrel-modal").style.display = "flex";
  setTimeout(
    () => document.getElementById("allocate-client-name").focus(),
    100,
  );
}
function closeAllocateModal() {
  document.getElementById("allocate-barrel-modal").style.display = "none";
  currentBarrelToAllocate = null;
}
async function confirmAllocateBarrel() {
  const cN = document.getElementById("allocate-client-name").value.trim();
  const p = parseFloat(document.getElementById("allocate-price").value) || 50;
  if (!cN) return showPopup("Erreur", "Nom invalide.");
  if (!currentBarrelToAllocate) return;
  await db
    .from("barrel_rentals")
    .insert({
      barrel_number: currentBarrelToAllocate,
      client_name: cN,
      price: p,
    });
  showToast("Tonneau alloué.", "success");
  closeAllocateModal();
  loadBarrels();
  loadPatronData();
}
async function updateBarrelPrice(id, np, num) {
  const p = parseFloat(np);
  if (isNaN(p) || p < 0) return loadBarrels();
  await db.from("barrel_rentals").update({ price: p }).eq("id", id);
  await addLog("Tonneau", `Prix tonneau n°${num} à ${p} S.`);
  loadBarrels();
}
async function payBarrel(id, num, cN) {
  let fp = 50;
  const card = document.getElementById(`barrel-${num}`);
  if (card) {
    const pI = card.querySelector('input[type="number"]');
    if (pI) {
      fp = parseFloat(pI.value) || 50;
      await db.from("barrel_rentals").update({ price: fp }).eq("id", id);
    } else {
      const { data } = await db
        .from("barrel_rentals")
        .select("price")
        .eq("id", id)
        .single();
      if (data && data.price) fp = data.price;
    }
  }
  showConfirm("Encaisser", `Encaisser ${fp} S ?`, async () => {
    await db
      .from("barrel_rentals")
      .update({ last_payment_date: new Date().toISOString() })
      .eq("id", id);
    await db
      .from("transactions")
      .insert({
        type: "vente",
        item_type: "Location tonneau",
        counterparty_name: cN,
        quantity: 1,
        unit_price: fp,
        created_by: currentUser.id,
      });
    showToast(`${fp} S encaissés.`, "success");
    loadBarrels();
    if (userProfile.role === "patron") {
      loadPatronData();
      loadTreasury();
    }
  });
}
async function freeBarrel(id) {
  showConfirm("Libérer", "Libérer ?", async () => {
    await db.from("barrel_rentals").delete().eq("id", id);
    showToast("Libéré.", "info");
    loadBarrels();
    loadPatronData();
  });
}

async function loadFurnaces() {
  const { data: furnaces } = await db
    .from("furnace_rentals")
    .select("*")
    .order("created_at", { ascending: true });
  const container = document.getElementById("furnaces-container");
  if (!container) return;
  if (furnaces && furnaces.length > 0) {
    container.innerHTML = "";
    let lateCount = 0;
    furnaces.forEach((f) => {
      let cC = "free",
        sT = "Libre",
        pI = "",
        aH = "";
      if (f.last_payment_date) {
        const lP = new Date(f.last_payment_date),
          nP = new Date(lP);
        nP.setDate(nP.getDate() + 7);
        const dD = Math.ceil(
          (nP.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        const o = { day: "2-digit", month: "2-digit", year: "numeric" };
        if (dD < 0) {
          cC = "late";
          sT = "En retard";
          lateCount++;
          pI = `<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Dû le : ${nP.toLocaleDateString("fr-FR", o)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(dD)}j</span>`;
        } else {
          cC = "paid";
          sT = "À jour";
          pI = `<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Prochain : <strong>${nP.toLocaleDateString("fr-FR", o)}</strong></span><span>Dans ${dD}j</span>`;
        }
      } else {
        cC = "late";
        sT = "Jamais payé";
        lateCount++;
        pI = `<span style="color: var(--danger);">Aucun paiement</span>`;
      }
      aH = `<button class="btn-pay" onclick="payFurnace(${f.id}, '${f.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser 30</button>`;
      if (userProfile.role === "patron")
        aH += `<button class="btn-free" onclick="freeFurnace(${f.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
      container.innerHTML += `<div class="barrel-card ${cC}"><div class="barrel-header"><h3>Four</h3><span class="status-badge">${sT}</span></div><div class="barrel-body"><div class="client-name"><i class="fa-solid fa-user"></i> ${f.client_name}</div><div class="pay-info">${pI}</div></div><div class="barrel-actions">${aH}</div></div>`;
    });
    updateNavBadge("nav-four-badge", lateCount);
  } else {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-fire"></i><p>Aucun client.</p></div>`;
    updateNavBadge("nav-four-badge", 0);
  }
}
function openFurnaceModal() {
  document.getElementById("furnace-client-name").value = "";
  document.getElementById("create-furnace-modal").style.display = "flex";
}
function closeFurnaceModal() {
  document.getElementById("create-furnace-modal").style.display = "none";
}
async function confirmCreateFurnace() {
  const cN = document.getElementById("furnace-client-name").value.trim();
  if (!cN) return showPopup("Erreur", "Nom.");
  await db
    .from("furnace_rentals")
    .insert({ client_name: cN, created_by: currentUser.id });
  showToast("Client ajouté.", "success");
  closeFurnaceModal();
  loadFurnaces();
}
async function payFurnace(id, cN) {
  showConfirm("Encaisser", `Encaisser 30 S ?`, async () => {
    await db
      .from("furnace_rentals")
      .update({ last_payment_date: new Date().toISOString() })
      .eq("id", id);
    await db
      .from("transactions")
      .insert({
        type: "vente",
        item_type: "Location four",
        counterparty_name: cN,
        quantity: 1,
        unit_price: 30,
        created_by: currentUser.id,
      });
    showToast("30 S encaissés.", "success");
    loadFurnaces();
    if (userProfile.role === "patron") {
      loadPatronData();
      loadTreasury();
    }
    loadEmployeData();
  });
}
async function freeFurnace(id) {
  showConfirm("Libérer", "Supprimer ?", async () => {
    await db.from("furnace_rentals").delete().eq("id", id);
    showToast("Client retiré.", "info");
    loadFurnaces();
  });
}

async function loadEmployeData() {
  if (!currentUser) return;
  const { data } = await db
    .from("transactions")
    .select("*")
    .eq("created_by", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const tbody = document.getElementById("emp-history-body");
  if (!tbody) return;
  if (data && data.length > 0) {
    tbody.innerHTML = "";
    data.forEach((t) => {
      const cost = t.quantity * t.unit_price,
        color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let bC =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") bC = "bg-blue";
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td><span class="badge-type ${bC}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Aucune opération.</p></div></td></tr>`;
  }
}

// ==========================================
// --- REALTIME ---
// ==========================================
function setupRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  const isTyping = () => {
    const a = document.activeElement;
    return (
      a &&
      (a.tagName === "INPUT" ||
        a.tagName === "SELECT" ||
        a.tagName === "TEXTAREA")
    );
  };
  realtimeChannel = db
    .channel("custom-all-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions" },
      () => {
        if (!isTyping()) {
          loadPatronData();
          loadEmployeData();
          loadTreasury();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "stocks" },
      (payload) => {
        if (!isTyping()) {
          loadStock();
          loadOrderRequirements();
        }
        if (payload.new && payload.new.quantity <= 20)
          showToast(`⚠️ Stock critique : ${payload.new.item_name}`, "warning");
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => {
        if (!isTyping()) loadPatronData();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "barrel_rentals" },
      () => {
        if (!isTyping()) {
          loadBarrels();
          loadPatronData();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "furnace_rentals" },
      () => {
        if (!isTyping()) loadFurnaces();
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "orders" },
      () => {
        if (!isTyping()) {
          loadOrders();
          loadOrderHistory();
          loadOrderRequirements();
        }
        showToast("Nouvelle commande reçue !", "info");
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders" },
      () => {
        if (!isTyping()) {
          loadOrders();
          loadOrderHistory();
          loadOrderRequirements();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "orders" },
      () => {
        if (!isTyping()) {
          loadOrders();
          loadOrderHistory();
          loadOrderRequirements();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "logs" },
      () => {
        if (!isTyping() && userProfile.role === "patron") loadLogs();
      },
    )
    .subscribe();
}

db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    checkUserStatus();
  }
});
