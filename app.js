const SUPABASE_URL = "https://ifbvulvyhledklktzjrv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYnZ1bHZ5aGxlZGtsa3R6anJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTE4OTUsImV4cCI6MjEwODk2Nzg5NX0.V0RQSqrZWVUIXprRjy5z5ax-4e8MT51yclDgpbf0oSc";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userProfile = null;
let chartAchatsInstance = null;
let chartVentesInstance = null;
let currentPeriod = "all";
let currentBarrelToAllocate = null;
let realtimeChannel = null;

const basePricesVente = {
  "Petit bois": 0.2,
  "Charbon Pauvre": 0.7,
  "Charbon Normale": 1.3,
  "Briquettes de Charbon": 3,
  "Coke de charbon": 6,
};
const basePricesAchat = {
  "Petit bois": 0.15,
  "Charbon Pauvre": 0.3,
  "Charbon Normale": 0.8,
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
// --- UI HELPERS ---
// ==========================================
function showPopup(title, message) {
  document.getElementById("popup-title").innerText = title;
  document.getElementById("popup-message").innerText = message;
  document.getElementById("custom-popup").style.display = "flex";
}
function closePopup() {
  document.getElementById("custom-popup").style.display = "none";
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
}

// ==========================================
// --- GESTION DES COMMANDES MULTIPLES ---
// ==========================================
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
            <option value="Petit bois">Petit bois</option>
            <option value="Charbon Pauvre">Charbon Pauvre</option>
            <option value="Charbon Normale">Charbon Normale</option>
            <option value="Briquettes de Charbon">Briquettes de Charbon</option>
            <option value="Coke de charbon">Coke de charbon</option>
        </select>
        <input type="number" class="order-item-qty" placeholder="Qté" min="1" value="1" style="width: 50px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
        <input type="number" class="order-item-price" placeholder="Prix" step="0.01" value="0.2" style="width: 60px; padding: 8px; background: var(--bg-input); border: 1px solid var(--border); color: white; border-radius: 4px;">
        <button type="button" onclick="this.parentElement.remove()" style="background: transparent; border: 1px solid var(--danger); color: var(--danger); padding: 8px 10px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
  container.appendChild(row);
  updateOrderItemPrice(row.querySelector(".order-item-select"));
}

function updateOrderItemPrice(selectElement) {
  const priceInput =
    selectElement.parentElement.querySelector(".order-item-price");
  const item = selectElement.value;
  priceInput.value = basePricesVente[item] || 1;
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("order-items-container")) {
    addOrderItemRow();
  }
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
  let total = 0;

  rows.forEach((row) => {
    const item_type = row.querySelector(".order-item-select").value;
    const quantity = parseFloat(row.querySelector(".order-item-qty").value);
    const unit_price = parseFloat(row.querySelector(".order-item-price").value);

    if (quantity > 0) {
      items.push({ item_type, quantity, unit_price });
      total += quantity * unit_price;
    }
  });

  if (items.length === 0)
    return showPopup(
      "Erreur",
      "Veuillez ajouter au moins un article avec une quantité > 0.",
    );

  const { error } = await db.from("orders").insert({
    client_name,
    items,
    delivery_time,
    deadline,
    note,
    created_by: currentUser.id,
  });

  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", "Commande créée !");
    document.getElementById("order-form").reset();
    document.getElementById("order-items-container").innerHTML = "";
    addOrderItemRow();
    loadOrders();
  }
}

async function loadOrders() {
  const { data: orders } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true });
  const container = document.getElementById("orders-container");
  if (!container) return;

  if (orders && orders.length > 0) {
    container.innerHTML = "";
    orders.forEach((o) => {
      let orderItems = o.items;
      if (!orderItems || orderItems.length === 0) {
        if (o.item_type)
          orderItems = [
            {
              item_type: o.item_type,
              quantity: o.quantity,
              unit_price: o.unit_price,
            },
          ];
        else orderItems = [];
      }

      let itemsHtml = "";
      let totalGeneral = 0;
      let maxDate = o.deadline
        ? new Date(o.deadline).toLocaleDateString()
        : "Non spécifiée";
      let timeStr = o.delivery_time ? ` à ${o.delivery_time}` : "";
      let noteHtml = o.note
        ? `<div style="margin-top: 10px; padding: 8px; background: rgba(212, 175, 55, 0.1); border-left: 3px solid var(--primary); font-size: 0.85em; font-style: italic; color: var(--text-main);"><i class="fa-solid fa-note-sticky"></i> Note : ${o.note}</div>`
        : "";

      orderItems.forEach((item) => {
        const cost = item.quantity * item.unit_price;
        totalGeneral += cost;
        const color = typeColors[item.item_type] || "#888";
        itemsHtml += `
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding: 5px 0; font-size: 0.9em;">
                        <span><strong style="color: ${color};">${item.quantity}x</strong> ${item.item_type}</span>
                        <span style="color: var(--text-muted);">(${parseFloat(item.unit_price).toFixed(2)} S/u)</span>
                    </div>
                `;
      });

      container.innerHTML += `
                <div class="order-card" style="border-left-color: var(--primary); padding: 15px; margin-bottom: 15px;">
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <h4 style="margin: 0; color: var(--primary);">${o.client_name}</h4>
                            <span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.8em;"><i class="fa-regular fa-clock"></i> ${maxDate}${timeStr}</span>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px;">
                        ${itemsHtml}
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-weight: bold; font-family: 'Cinzel';">
                            <span>TOTAL :</span>
                            <span style="color: var(--success);">${Math.round(totalGeneral)} S</span>
                        </div>
                    </div>

                    ${noteHtml}

                    <div class="actions" style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn-honor" style="flex: 1;" onclick='honorOrder("${o.id}", "${o.client_name}", ${JSON.stringify(orderItems).replace(/'/g, "&#39;")})'>
                            <i class="fa-solid fa-check"></i> Honorer
                        </button>
                        <button class="btn-cancel" style="flex: 1;" onclick="cancelOrder(${o.id})">
                            <i class="fa-solid fa-xmark"></i> Annuler
                        </button>
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
    if (stock && stock.quantity < item.quantity) {
      return showPopup(
        "Stock Insuffisant",
        `Il manque du ${item.item_type} (Besoin: ${item.quantity}, En stock: ${stock.quantity}).`,
      );
    }
  }

  showConfirm(
    "Honorer la commande",
    `Créer les transactions et déduire le stock pour ${client_name} ?`,
    async () => {
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

      await db.from("orders").delete().eq("id", id);

      showPopup(
        "Commande Honorée",
        "Les ventes ont été enregistrées et le stock mis à jour !",
      );
      loadOrders();
      loadStock();
      loadEmployeData();
      if (userProfile.role === "patron") {
        loadPatronData();
        loadTreasury();
      }
    },
  );
}

async function cancelOrder(id) {
  showConfirm("Annuler", "Annuler cette commande ?", async () => {
    await db.from("orders").delete().eq("id", id);
    loadOrders();
  });
}

// ==========================================
// --- GESTION DES PÉRIODES ---
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

// ==========================================
// --- AUTHENTIFICATION & INITIALISATION ---
// ==========================================
async function register() {
  const pseudo = document.getElementById("reg-pseudo").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!pseudo || !password)
    return showPopup("Erreur", "Veuillez remplir tous les champs.");
  if (password.length < 6)
    return showPopup("Erreur", "Le code doit faire 6 caractères min.");
  const fakeEmail = `${pseudo.toLowerCase().replace(/\s+/g, "")}@example.com`;
  const { error } = await db.auth.signUp({
    email: fakeEmail,
    password,
    options: { data: { full_name: pseudo } },
  });
  if (error) return showPopup("Erreur", error.message);
  showPopup("Dossier Transmis", "Votre demande a été envoyée au Patron.");
  toggleAuth("login");
}

async function login() {
  const pseudo = document.getElementById("login-pseudo").value.trim();
  const password = document.getElementById("login-password").value;
  if (!pseudo || !password)
    return showPopup("Erreur", "Identifiants manquants.");
  const fakeEmail = `${pseudo.toLowerCase().replace(/\s+/g, "")}@example.com`;
  const { data, error } = await db.auth.signInWithPassword({
    email: fakeEmail,
    password,
  });
  if (error) return showPopup("Accès Refusé", "Identifiants incorrects.");
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
    const treasuryCard = document.getElementById("treasury-card");
    if (treasuryCard) treasuryCard.style.display = "block";
    switchTab("tab-gestion", document.getElementById("nav-gestion"));
    loadPatronData();
    loadBarrels();
    loadFurnaces();
    loadEmployeData();
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
    const treasuryCard = document.getElementById("treasury-card");
    if (treasuryCard) treasuryCard.style.display = "none";
    switchTab("tab-commandes", document.querySelector(".nav-btn"));
    loadFurnaces();
    loadEmployeData();
  }

  loadStock();
  loadTreasury();
  loadOrders();
  updateBasePrice();
  setupRealtime();
}

function setupRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  const isTyping = () => {
    const active = document.activeElement;
    return (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "SELECT" ||
        active.tagName === "TEXTAREA")
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
      { event: "*", schema: "public", table: "stocks" },
      () => {
        if (!isTyping()) loadStock();
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
        if (!isTyping()) loadBarrels();
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
      { event: "*", schema: "public", table: "orders" },
      () => {
        if (!isTyping()) loadOrders();
      },
    )
    .subscribe();
}

// ==========================================
// --- TRÉSORERIE (PATRON) ---
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
    "Modification directe",
    `Ajuster de ${diff > 0 ? "+" : ""}${diff} S ?`,
    async () => {
      const { error } = await db.from("transactions").insert({
        type: "ajustement",
        item_type: "Ajustement",
        counterparty_name: "Modification directe",
        quantity: 1,
        unit_price: diff,
        created_by: currentUser.id,
      });
      if (error) {
        showPopup("Erreur", error.message);
        loadTreasury();
      } else {
        loadTreasury();
        loadPatronData();
      }
    },
  );
}

async function adjustTreasury(type) {
  const amount = parseInt(document.getElementById("manual-amount").value);
  if (!amount || amount <= 0) return showPopup("Erreur", "Montant invalide.");
  const action = type === 1 ? "Ajouter" : "Retirer";
  showConfirm(
    `Ajustement`,
    `Voulez-vous ${action.toLowerCase()} ${amount} S ?`,
    async () => {
      const { error } = await db.from("transactions").insert({
        type: "ajustement",
        item_type: "Ajustement",
        counterparty_name: `Manuel (${action})`,
        quantity: 1,
        unit_price: type === 1 ? amount : -amount,
        created_by: currentUser.id,
      });
      if (error) showPopup("Erreur", error.message);
      else {
        showPopup("Succès", `${amount} S ${action.toLowerCase()}s.`);
        document.getElementById("manual-amount").value = "";
        loadTreasury();
        loadPatronData();
      }
    },
  );
}

// ==========================================
// --- GESTION DU STOCK ---
// ==========================================
async function loadStock() {
  const { data: stocks, error } = await db
    .from("stocks")
    .select("*")
    .order("id");
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
      const controls =
        userProfile.role === "patron"
          ? `
                <div class="stock-controls">
                    <input type="number" id="stock-qty-${s.id}" placeholder="Qté" min="1">
                    <div class="stock-buttons">
                        <button class="btn-add" onclick="adjustStock(${s.id}, ${s.quantity}, 1)"><i class="fa-solid fa-plus"></i></button>
                        <button class="btn-sub" onclick="adjustStock(${s.id}, ${s.quantity}, -1)"><i class="fa-solid fa-minus"></i></button>
                    </div>
                </div>`
          : "";
      container.innerHTML += `<div class="stock-item" style="border-left-color: ${color};"><h4 style="background-color: ${color}; color: #fff;">${s.item_name}</h4><div class="qty">${s.quantity}</div>${controls}</div>`;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><p>Stock vide.</p></div>`;
  }
}

async function adjustStock(id, currentQty, op) {
  const input = document.getElementById(`stock-qty-${id}`);
  const amount = parseInt(input.value);
  if (!amount || amount <= 0) return showPopup("Erreur", "Qté invalide.");
  let newQty = op === 1 ? currentQty + amount : currentQty - amount;
  if (newQty < 0) newQty = 0;
  await db.from("stocks").update({ quantity: newQty }).eq("id", id);
  input.value = "";
  loadStock();
}

// ==========================================
// --- SAISIE DIRECTE ---
// ==========================================
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
      type === "vente"
        ? basePricesVente[item] || 0
        : basePricesAchat[item] || 0;
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
      return showPopup(
        "Stock Insuffisant",
        `Il ne reste que ${stock.quantity}.`,
      );
  }
  const { error } = await db.from("transactions").insert({
    type,
    item_type,
    counterparty_name: userProfile.full_name,
    quantity,
    unit_price,
    created_by: currentUser.id,
  });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", "Enregistré !");
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
// --- VUE GESTION (PATRON) ---
// ==========================================
async function loadPatronData() {
  const { data: personnel, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  const personnelDiv = document.getElementById("admin-personnel-list");
  const salDiv = document.getElementById("admin-salaries-list");
  if (!personnelDiv || !salDiv) return;
  personnelDiv.innerHTML = "";
  salDiv.innerHTML = "";
  if (error) {
    personnelDiv.innerHTML = `<p class="text-danger">Erreur.</p>`;
  } else if (!personnel || personnel.length === 0) {
    personnelDiv.innerHTML = `<div class="empty-state"><p>Aucun employé.</p></div>`;
  } else {
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
  const { data: allT } = await db
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  const filtered = getFilteredTransactions(allT);
  const tbody = document.getElementById("admin-history-body");
  if (filtered && filtered.length > 0) {
    tbody.innerHTML = "";
    let tA = 0,
      tV = 0,
      tS = 0;
    filtered.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      if (t.type === "achat") tA += cost;
      else if (t.type === "salaire") tS += cost;
      else if (t.type === "vente") tV += cost;
      const color = typeColors[t.item_type] || "#888";
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
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td>${t.counterparty_name}</td><td><span class="badge-type ${bC}" style="${t.type === "ajustement" ? "background-color: #3b82f6; color: white;" : ""}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: #fff;">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${tC}">${Math.round(cost)} S</td><td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
    const tD = tA + tS;
    document.getElementById("stat-ventes").innerText = Math.round(tV) + " S";
    document.getElementById("stat-achats").innerText = Math.round(tD) + " S";
    const b = tV - tD;
    const eB = document.getElementById("stat-benefice");
    eB.innerText = Math.round(b) + " S";
    eB.className = b >= 0 ? "text-success" : "text-danger";
    renderCharts(filtered);
  } else {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Aucune transaction.</p></div></td></tr>`;
    document.getElementById("stat-ventes").innerText = "0 S";
    document.getElementById("stat-achats").innerText = "0 S";
    document.getElementById("stat-benefice").innerText = "0 S";
    renderCharts([]);
  }
}

function renderCharts(transactions) {
  let achats = {
    "Petit bois": 0,
    "Charbon Pauvre": 0,
    "Charbon Normale": 0,
    "Briquettes de Charbon": 0,
    "Coke de charbon": 0,
    Divers: 0,
  };
  let ventes = {
    "Petit bois": 0,
    "Charbon Pauvre": 0,
    "Charbon Normale": 0,
    "Briquettes de Charbon": 0,
    "Coke de charbon": 0,
    "Location tonneau": 0,
    "Location four": 0,
  };
  transactions.forEach((t) => {
    const cost = t.quantity * t.unit_price;
    if (t.type === "achat") {
      if (achats[t.item_type] !== undefined) achats[t.item_type] += cost;
      else achats["Divers"] += cost;
    }
    if (t.type === "vente" && ventes[t.item_type] !== undefined)
      ventes[t.item_type] += cost;
  });
  const lA = Object.keys(achats).filter((k) => achats[k] > 0);
  const dA = lA.map((k) => achats[k]);
  const lV = Object.keys(ventes).filter((k) => ventes[k] > 0);
  const dV = lV.map((k) => ventes[k]);
  if (chartAchatsInstance) chartAchatsInstance.destroy();
  if (chartVentesInstance) chartVentesInstance.destroy();
  const cO = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 0 },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#94A3B8",
          font: { family: "Inter", size: 12 },
          padding: 15,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
    },
  };
  const cA = document.getElementById("chart-achats").getContext("2d");
  chartAchatsInstance = new Chart(cA, {
    type: "doughnut",
    data: {
      labels: lA.length ? lA : ["Vide"],
      datasets: [
        {
          data: dA.length ? dA : [1],
          backgroundColor: lA.length
            ? lA.map((l) => typeColors[l] || "#888")
            : ["#2A2A35"],
          borderWidth: 0,
          cutout: "60%",
        },
      ],
    },
    options: lA.length
      ? cO
      : { ...cO, plugins: { ...cO.plugins, legend: { display: false } } },
  });
  const cV = document.getElementById("chart-ventes").getContext("2d");
  chartVentesInstance = new Chart(cV, {
    type: "doughnut",
    data: {
      labels: lV.length ? lV : ["Vide"],
      datasets: [
        {
          data: dV.length ? dV : [1],
          backgroundColor: lV.length
            ? lV.map((l) => typeColors[l] || "#888")
            : ["#2A2A35"],
          borderWidth: 0,
          cutout: "60%",
        },
      ],
    },
    options: lV.length
      ? cO
      : { ...cO, plugins: { ...cO.plugins, legend: { display: false } } },
  });
}

async function showUserHistory(userId, userName) {
  document.getElementById("user-history-title").innerText =
    `Historique de ${userName}`;
  document.getElementById("user-history-body").innerHTML =
    '<tr><td colspan="6" class="text-center">Chargement...</td></tr>';
  document.getElementById("user-history-modal").style.display = "flex";
  const { data: transactions } = await db
    .from("transactions")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  const tbody = document.getElementById("user-history-body");
  if (transactions && transactions.length > 0) {
    tbody.innerHTML = "";
    transactions.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      let bC =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") bC = "bg-blue";
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td><span class="badge-type ${bC}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: #fff;">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td></tr>`;
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
  showPopup("Validé", "Le joueur peut travailler.");
  loadPatronData();
}
async function changerRole(id, role) {
  showConfirm("Changement", `Nommer cet utilisateur ${role} ?`, async () => {
    await db.from("profiles").update({ role: role }).eq("id", id);
    showPopup("Succès", `Rôle mis à jour.`);
    loadPatronData();
  });
}
async function virerUtilisateur(id, nom) {
  showConfirm("Virer", `VIRER ${nom} ?`, async () => {
    await db.rpc("supprimer_utilisateur", { target_user_id: id });
    showPopup("Viré", `${nom} supprimé.`);
    loadPatronData();
  });
}
async function deleteTransaction(id) {
  showConfirm("Supprimer", "Supprimer cette transaction ?", async () => {
    await db.from("transactions").delete().eq("id", id);
    loadPatronData();
    loadEmployeData();
    loadTreasury();
  });
}

async function paySalaries() {
  const inputs = document.querySelectorAll('[id^="sal-amount-"]');
  if (inputs.length === 0) return showPopup("Info", "Aucun employé à payer.");
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
      showPopup("Payé", `${totalPaye} S distribués.`);
      loadPatronData();
      loadEmployeData();
      loadTreasury();
    },
  );
}

// ==========================================
// --- TONNEAUX ---
// ==========================================
async function loadBarrels() {
  const { data: rentals } = await db.from("barrel_rentals").select("*");
  const container = document.querySelector("#tab-location .barrels-grid");
  if (!container) return;
  if (container.innerHTML.trim() === "") {
    container.innerHTML = "";
    for (let i = 1; i <= 23; i++)
      container.innerHTML += `<div class="barrel-card free" id="barrel-${i}"><div class="barrel-header"><h3>Tonneau n°${i}</h3><span class="status-badge">Libre</span></div><div class="barrel-body"><div class="client-name"></div><div class="pay-info"></div></div><div class="barrel-actions"><button class="btn-allocate" onclick="allocateBarrel(${i})">Allouer</button></div></div>`;
  }
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
        pH = `<div class="barrel-price-container" onclick="this.querySelector('input').focus()"><span style="color: var(--text-muted); font-size: 0.9em;">Prix :</span> <div style="display:flex; align-items:center; gap:5px;"><input type="number" class="barrel-price-input" value="${rental.price || 50}" onchange="updateBarrelPrice(${rental.id}, this.value)"><span style="color: var(--primary); font-weight: bold;">S</span><i class="fa-solid fa-pen" style="color: var(--text-muted); font-size: 0.8em; margin-left: 5px;"></i></div></div>`;
      if (rental.last_payment_date) {
        const lP = new Date(rental.last_payment_date),
          nP = new Date(lP);
        nP.setDate(nP.getDate() + 7);
        const dD = Math.ceil(
            (nP.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
          ),
          o = { day: "2-digit", month: "2-digit", year: "numeric" };
        if (dD < 0) {
          card.classList.add("late");
          sE.innerText = "En retard";
          pE.innerHTML = `${pH}<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Dû le : ${nP.toLocaleDateString("fr-FR", o)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(dD)}j</span>`;
        } else {
          card.classList.add("paid");
          sE.innerText = "À jour";
          pE.innerHTML = `${pH}<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Prochain : <strong>${nP.toLocaleDateString("fr-FR", o)}</strong></span><span>Dans ${dD}j</span>`;
        }
      } else {
        card.classList.add("late");
        sE.innerText = "Jamais payé";
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
  await db.from("barrel_rentals").insert({
    barrel_number: currentBarrelToAllocate,
    client_name: cN,
    price: p,
  });
  showPopup("Succès", `Tonneau alloué.`);
  closeAllocateModal();
  loadBarrels();
}
async function updateBarrelPrice(id, np) {
  const p = parseFloat(np);
  if (isNaN(p) || p < 0) return loadBarrels();
  await db.from("barrel_rentals").update({ price: p }).eq("id", id);
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
  showConfirm("Encaisser", `Encaisser ${fp} S pour le tonneau ?`, async () => {
    await db
      .from("barrel_rentals")
      .update({ last_payment_date: new Date().toISOString() })
      .eq("id", id);
    await db.from("transactions").insert({
      type: "vente",
      item_type: "Location tonneau",
      counterparty_name: cN,
      quantity: 1,
      unit_price: fp,
      created_by: currentUser.id,
    });
    showPopup("Payé", `${fp} S encaissés.`);
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
    loadBarrels();
  });
}

// ==========================================
// --- FOURS ---
// ==========================================
async function loadFurnaces() {
  const { data: furnaces } = await db
    .from("furnace_rentals")
    .select("*")
    .order("created_at", { ascending: true });
  const container = document.getElementById("furnaces-container");
  if (!container) return;
  if (furnaces && furnaces.length > 0) {
    container.innerHTML = "";
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
          ),
          o = { day: "2-digit", month: "2-digit", year: "numeric" };
        if (dD < 0) {
          cC = "late";
          sT = "En retard";
          pI = `<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Dû le : ${nP.toLocaleDateString("fr-FR", o)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(dD)}j</span>`;
        } else {
          cC = "paid";
          sT = "À jour";
          pI = `<span>Dernier : ${lP.toLocaleDateString("fr-FR", o)}</span><span class="next-pay-date">Prochain : <strong>${nP.toLocaleDateString("fr-FR", o)}</strong></span><span>Dans ${dD}j</span>`;
        }
      } else {
        cC = "late";
        sT = "Jamais payé";
        pI = `<span style="color: var(--danger);">Aucun paiement</span>`;
      }
      aH = `<button class="btn-pay" onclick="payFurnace(${f.id}, '${f.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser 30</button>`;
      if (userProfile.role === "patron")
        aH += `<button class="btn-free" onclick="freeFurnace(${f.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
      container.innerHTML += `<div class="barrel-card ${cC}"><div class="barrel-header"><h3>Four</h3><span class="status-badge">${sT}</span></div><div class="barrel-body"><div class="client-name"><i class="fa-solid fa-user"></i> ${f.client_name}</div><div class="pay-info">${pI}</div></div><div class="barrel-actions">${aH}</div></div>`;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-fire"></i><p>Aucun client.</p></div>`;
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
  showPopup("Succès", `Ajouté.`);
  closeFurnaceModal();
  loadFurnaces();
}
async function payFurnace(id, cN) {
  showConfirm("Encaisser", `Encaisser 30 S ?`, async () => {
    await db
      .from("furnace_rentals")
      .update({ last_payment_date: new Date().toISOString() })
      .eq("id", id);
    await db.from("transactions").insert({
      type: "vente",
      item_type: "Location four",
      counterparty_name: cN,
      quantity: 1,
      unit_price: 30,
      created_by: currentUser.id,
    });
    showPopup("Payé", `30 S encaissés.`);
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
    loadFurnaces();
  });
}

async function loadEmployeData() {
  if (!currentUser) return;
  const { data } = await db
    .from("transactions")
    .select("*")
    .eq("created_by", currentUser.id)
    .order("created_at", { ascending: false });
  const tbody = document.getElementById("emp-history-body");
  if (!tbody) return;
  if (data && data.length > 0) {
    tbody.innerHTML = "";
    data.forEach((t) => {
      const cost = t.quantity * t.unit_price,
        color = typeColors[t.item_type] || "#888";
      let bC =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") bC = "bg-blue";
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td><span class="badge-type ${bC}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: #fff;">${t.item_type}</span></td><td>${t.quantity}</td><td>${parseFloat(t.unit_price).toFixed(2)} S</td><td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Aucune opération.</p></div></td></tr>`;
  }
}

db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    checkUserStatus();
  }
});
