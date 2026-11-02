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

const basePricesVente = {
  "Petit bois": 0.2,
  "Charbon Pauvre": 0.5,
  "Charbon Normale": 1.0,
  "Briquettes de Charbon": 4.0,
  "Coke de charbon": 6.0,
};
const basePricesAchat = {
  "Petit bois": 0.0,
  "Charbon Pauvre": 0.3,
  "Charbon Normale": 0.8,
  "Briquettes de Charbon": 3.0,
  "Coke de charbon": 5.0,
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
// --- AUTHENTIFICATION ---
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
  await db.auth.signOut();
  location.reload();
}

// ==========================================
// --- INITIALISATION & RÔLES ---
// ==========================================
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

  // Configuration des menus selon le rôle
  if (profile.role === "patron") {
    document.getElementById("nav-gestion").style.display = "flex";
    document.getElementById("nav-location").style.display = "flex";
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "none";
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
    // Le contremaître voit tout SAUF la gestion (tableau de bord)
    document.getElementById("nav-gestion").style.display = "none";
    document.getElementById("nav-location").style.display = "flex";
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "flex";
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
    // L'employé classique
    document.getElementById("nav-gestion").style.display = "none";
    document.getElementById("nav-location").style.display = "none"; // Tonneau : Patron/Contremaitre uniquement
    document.getElementById("nav-four").style.display = "flex";
    document.getElementById("nav-historique").style.display = "flex";
    switchTab("tab-commandes", document.querySelector(".nav-btn"));
    loadFurnaces();
    loadEmployeData();
  }

  loadStock();
  loadOrders();
  updateBasePrice();
}

// ==========================================
// --- GESTION DES TONNEAUX (23 TONNEAUX) ---
// ==========================================
async function loadBarrels() {
  const { data: rentals } = await db.from("barrel_rentals").select("*");
  const container = document.querySelector("#tab-location .barrels-grid");

  if (!container) return;

  // Générer les 23 cartes si elles n'existent pas
  if (!document.getElementById("barrel-1")) {
    container.innerHTML = "";
    for (let i = 1; i <= 23; i++) {
      container.innerHTML += `
            <div class="barrel-card free" id="barrel-${i}">
                <div class="barrel-header"><h3>Tonneau n°${i}</h3><span class="status-badge">Libre</span></div>
                <div class="barrel-body"><div class="client-name"></div><div class="pay-info"></div></div>
                <div class="barrel-actions"><button class="btn-allocate" onclick="allocateBarrel(${i})">Allouer</button></div>
            </div>`;
    }
  }

  for (let i = 1; i <= 23; i++) {
    const card = document.getElementById(`barrel-${i}`);
    if (!card) continue;
    const rental = rentals ? rentals.find((r) => r.barrel_number === i) : null;

    card.className = "barrel-card free";
    const statusEl = card.querySelector(".status-badge");
    const clientEl = card.querySelector(".client-name");
    const payInfoEl = card.querySelector(".pay-info");
    const actionsEl = card.querySelector(".barrel-actions");

    if (rental) {
      clientEl.innerHTML = `<i class="fa-solid fa-user"></i> ${rental.client_name}`;
      if (rental.last_payment_date) {
        const lastPay = new Date(rental.last_payment_date);
        const nextPay = new Date(lastPay);
        nextPay.setDate(nextPay.getDate() + 7);
        const now = new Date();
        const diffDays = Math.ceil(
          (nextPay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const options = { day: "2-digit", month: "2-digit", year: "numeric" };

        if (diffDays < 0) {
          card.classList.add("late");
          statusEl.innerText = "En retard";
          payInfoEl.innerHTML = `<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Dû le : ${nextPay.toLocaleDateString("fr-FR", options)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(diffDays)}j</span>`;
        } else {
          card.classList.add("paid");
          statusEl.innerText = "À jour";
          payInfoEl.innerHTML = `<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Prochain : <strong>${nextPay.toLocaleDateString("fr-FR", options)}</strong></span><span>Dans ${diffDays}j</span>`;
        }
      } else {
        card.classList.add("late");
        statusEl.innerText = "Jamais payé";
        payInfoEl.innerHTML = `<span style="color: var(--danger);">Aucun paiement</span>`;
      }
      actionsEl.innerHTML = `<button class="btn-pay" onclick="payBarrel(${rental.id}, ${i}, '${rental.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser 50</button><button class="btn-free" onclick="freeBarrel(${rental.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
    } else {
      clientEl.innerHTML = "";
      payInfoEl.innerHTML = "";
      statusEl.innerText = "Libre";
      actionsEl.innerHTML = `<button class="btn-allocate" onclick="allocateBarrel(${i})"><i class="fa-solid fa-plus"></i> Allouer</button>`;
    }
  }
}

function allocateBarrel(num) {
  currentBarrelToAllocate = num;
  document.getElementById("allocate-barrel-title").innerText =
    `Tonneau n°${num}`;
  document.getElementById("allocate-client-name").value = "";
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
  const clientName = document
    .getElementById("allocate-client-name")
    .value.trim();
  if (!clientName)
    return showPopup("Erreur", "Veuillez entrer un nom de client.");
  if (!currentBarrelToAllocate) return;
  const { error } = await db
    .from("barrel_rentals")
    .insert({
      barrel_number: currentBarrelToAllocate,
      client_name: clientName,
    });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", `Tonneau n°${currentBarrelToAllocate} alloué.`);
    closeAllocateModal();
    loadBarrels();
  }
}

async function payBarrel(id, num, clientName) {
  showConfirm(
    "Encaisser",
    `Encaisser 50 Septims pour le tonneau n°${num} ?`,
    async () => {
      const { error: errRental } = await db
        .from("barrel_rentals")
        .update({ last_payment_date: new Date().toISOString() })
        .eq("id", id);
      if (errRental) return showPopup("Erreur", "Erreur.");
      await db
        .from("transactions")
        .insert({
          type: "vente",
          item_type: "Location tonneau",
          counterparty_name: clientName,
          quantity: 1,
          unit_price: 50,
          created_by: currentUser.id,
        });
      showPopup("Payé", `50 Septims encaissés.`);
      loadBarrels();
      if (userProfile.role === "patron") loadPatronData();
    },
  );
}

async function freeBarrel(id) {
  showConfirm(
    "Libérer",
    "Voulez-vous vraiment libérer ce tonneau ?",
    async () => {
      await db.from("barrel_rentals").delete().eq("id", id);
      loadBarrels();
    },
  );
}

// ==========================================
// --- LOCATION DE FOUR ---
// ==========================================
async function loadFurnaces() {
  const { data: furnaces } = await db
    .from("furnace_rentals")
    .select("*")
    .order("created_at", { ascending: true });
  const container = document.getElementById("furnaces-container");

  if (furnaces && furnaces.length > 0) {
    container.innerHTML = "";
    furnaces.forEach((f) => {
      let cardClass = "free";
      let statusText = "Libre";
      let payInfo = "";
      let actionsHtml = "";

      if (f.last_payment_date) {
        const lastPay = new Date(f.last_payment_date);
        const nextPay = new Date(lastPay);
        nextPay.setDate(nextPay.getDate() + 7);
        const now = new Date();
        const diffDays = Math.ceil(
          (nextPay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const options = { day: "2-digit", month: "2-digit", year: "numeric" };

        if (diffDays < 0) {
          cardClass = "late";
          statusText = "En retard";
          payInfo = `<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Dû le : ${nextPay.toLocaleDateString("fr-FR", options)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(diffDays)}j</span>`;
        } else {
          cardClass = "paid";
          statusText = "À jour";
          payInfo = `<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Prochain : <strong>${nextPay.toLocaleDateString("fr-FR", options)}</strong></span><span>Dans ${diffDays}j</span>`;
        }
      } else {
        cardClass = "late";
        statusText = "Jamais payé";
        payInfo = `<span style="color: var(--danger);">Aucun paiement</span>`;
      }

      actionsHtml = `<button class="btn-pay" onclick="payFurnace(${f.id}, '${f.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser 30</button>`;
      if (userProfile.role === "patron") {
        actionsHtml += `<button class="btn-free" onclick="freeFurnace(${f.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
      }

      container.innerHTML += `
                <div class="barrel-card ${cardClass}">
                    <div class="barrel-header"><h3>Four</h3><span class="status-badge">${statusText}</span></div>
                    <div class="barrel-body">
                        <div class="client-name"><i class="fa-solid fa-user"></i> ${f.client_name}</div>
                        <div class="pay-info">${payInfo}</div>
                    </div>
                    <div class="barrel-actions">${actionsHtml}</div>
                </div>
            `;
    });
  } else {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-fire"></i>
                <p>Aucun client n'utilise le four actuellement.</p>
            </div>`;
  }
}

function openFurnaceModal() {
  document.getElementById("furnace-client-name").value = "";
  document.getElementById("create-furnace-modal").style.display = "flex";
  setTimeout(() => document.getElementById("furnace-client-name").focus(), 100);
}
function closeFurnaceModal() {
  document.getElementById("create-furnace-modal").style.display = "none";
}

async function confirmCreateFurnace() {
  const clientName = document
    .getElementById("furnace-client-name")
    .value.trim();
  if (!clientName)
    return showPopup("Erreur", "Veuillez entrer un nom de client.");

  const { error } = await db
    .from("furnace_rentals")
    .insert({ client_name: clientName, created_by: currentUser.id });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", `Client ${clientName} ajouté pour le four.`);
    closeFurnaceModal();
    loadFurnaces();
  }
}

async function payFurnace(id, clientName) {
  showConfirm(
    "Encaisser",
    `Encaisser 30 Septims pour le four (${clientName}) ?`,
    async () => {
      const { error: errFurnace } = await db
        .from("furnace_rentals")
        .update({ last_payment_date: new Date().toISOString() })
        .eq("id", id);
      if (errFurnace) return showPopup("Erreur", "Impossible.");

      await db.from("transactions").insert({
        type: "vente",
        item_type: "Location four",
        counterparty_name: clientName,
        quantity: 1,
        unit_price: 30,
        created_by: currentUser.id,
      });

      showPopup("Payé", `30 Septims encaissés. Prochain paiement dans 7j.`);
      loadFurnaces();
      if (userProfile.role === "patron") loadPatronData();
      loadEmployeData();
    },
  );
}

async function freeFurnace(id) {
  showConfirm(
    "Libérer",
    "Voulez-vous vraiment supprimer ce client du four ?",
    async () => {
      await db.from("furnace_rentals").delete().eq("id", id);
      loadFurnaces();
    },
  );
}

// ==========================================
// --- COMMANDES & STOCK ---
// ==========================================
async function createOrder(e) {
  e.preventDefault();
  const client_name = document.getElementById("ord-client").value.trim();
  const item_type = document.getElementById("ord-item").value;
  const quantity = parseFloat(document.getElementById("ord-qty").value);
  const unit_price = parseFloat(document.getElementById("ord-price").value);
  const deadlineInput = document.getElementById("ord-deadline").value;
  const deadline = deadlineInput ? deadlineInput : null;

  const { error } = await db
    .from("orders")
    .insert({
      client_name,
      item_type,
      quantity,
      unit_price,
      deadline,
      created_by: currentUser.id,
    });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", "Commande créée !");
    document.getElementById("order-form").reset();
    loadOrders();
  }
}

async function loadOrders() {
  const { data: orders } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true });
  const container = document.getElementById("orders-container");

  if (orders && orders.length > 0) {
    container.innerHTML = "";
    orders.forEach((o) => {
      const color = typeColors[o.item_type] || "#888";
      const total = (o.quantity * o.unit_price).toFixed(2);
      let dateHtml = o.deadline
        ? `<span class="text-warning" style="display:block; margin-top:8px;"><i class="fa-solid fa-clock"></i> Avant le : ${new Date(o.deadline).toLocaleDateString()}</span>`
        : "";
      container.innerHTML += `
                <div class="order-card" style="border-left-color: ${color};">
                    <div><h4>${o.item_type}</h4><div class="client">Client : ${o.client_name}</div>
                        <div class="details"><span><strong>Quantité :</strong> ${o.quantity}</span><span><strong>Prix U. :</strong> ${o.unit_price} S</span><span><strong>Total :</strong> ${total} S</span>${dateHtml}</div>
                    </div>
                    <div class="actions">
                        <button class="btn-honor" onclick="honorOrder(${o.id}, '${o.client_name}', '${o.item_type}', ${o.quantity}, ${o.unit_price})"><i class="fa-solid fa-check"></i> Honorer</button>
                        <button class="btn-cancel" onclick="cancelOrder(${o.id})"><i class="fa-solid fa-xmark"></i> Annuler</button>
                    </div>
                </div>`;
    });
  } else {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clipboard-list"></i>
                <p>Aucune commande en attente pour le moment.</p>
            </div>`;
  }
}

async function honorOrder(id, client_name, item_type, quantity, unit_price) {
  const { data: stock } = await db
    .from("stocks")
    .select("quantity")
    .eq("item_name", item_type)
    .single();
  if (stock && stock.quantity < quantity)
    return showPopup(
      "Stock Insuffisant",
      `Il n'y a que ${stock.quantity} ${item_type}.`,
    );
  const { error: tErr } = await db
    .from("transactions")
    .insert({
      type: "vente",
      item_type,
      counterparty_name: client_name,
      quantity,
      unit_price,
      created_by: currentUser.id,
    });
  if (tErr) return showPopup("Erreur", tErr.message);
  await db.from("orders").delete().eq("id", id);
  showPopup("Commande Honorée", "Vente enregistrée !");
  loadOrders();
  loadStock();
  loadEmployeData();
  if (userProfile.role === "patron") loadPatronData();
}

async function cancelOrder(id) {
  showConfirm("Annuler", "Annuler cette commande ?", async () => {
    await db.from("orders").delete().eq("id", id);
    loadOrders();
  });
}

async function loadStock() {
  const { data: stocks } = await db.from("stocks").select("*").order("id");
  const container = document.getElementById("stock-container");
  container.innerHTML = "";
  if (stocks) {
    stocks.forEach((s) => {
      const color = typeColors[s.item_name] || "#888";
      const textColor = s.item_name === "Charbon Normale" ? "#333" : "#fff";
      const qtyHtml =
        userProfile.role === "patron"
          ? `<input type="number" value="${s.quantity}" onchange="updateStockManual(${s.id}, this.value)">`
          : `<div class="qty">${s.quantity}</div>`;
      container.innerHTML += `<div class="stock-item" style="border-left-color: ${color};"><h4 style="background-color: ${color}; color: ${textColor};">${s.item_name}</h4>${qtyHtml}</div>`;
    });
  }
}

async function updateStockManual(id, newQty) {
  await db
    .from("stocks")
    .update({ quantity: parseFloat(newQty) || 0 })
    .eq("id", id);
}

// ==========================================
// --- SAISIE DIRECTE & HISTORIQUE ---
// ==========================================
function updateBasePrice() {
  const type = document.getElementById("emp-type").value;
  const select = document.getElementById("emp-item");
  const item = select.value;
  let price =
    type === "vente" ? basePricesVente[item] || 0 : basePricesAchat[item] || 0;
  document.getElementById("emp-price").value = price.toFixed(2);
  select.style.backgroundColor = typeColors[item] || "#333";
  select.style.color = item === "Charbon Normale" ? "#333" : "#fff";
  calcEmpTotal();
}

document.getElementById("emp-quantity").addEventListener("input", calcEmpTotal);
document.getElementById("emp-price").addEventListener("input", calcEmpTotal);
function calcEmpTotal() {
  const q = parseFloat(document.getElementById("emp-quantity").value) || 0;
  const p = parseFloat(document.getElementById("emp-price").value) || 0;
  document.getElementById("emp-total").value = (q * p).toFixed(2) + " Septims";
}

async function addTransaction(e) {
  e.preventDefault();
  const type = document.getElementById("emp-type").value;
  const item_type = document.getElementById("emp-item").value;
  const quantity = parseFloat(document.getElementById("emp-quantity").value);
  const unit_price = parseFloat(document.getElementById("emp-price").value);

  if (type === "vente") {
    const { data: stock } = await db
      .from("stocks")
      .select("quantity")
      .eq("item_name", item_type)
      .single();
    if (stock && stock.quantity < quantity)
      return showPopup(
        "Stock Insuffisant",
        `Il ne reste que ${stock.quantity} ${item_type}.`,
      );
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
    showPopup("Succès", "Opération enregistrée !");
    loadEmployeData();
    loadStock();
    if (userProfile.role === "patron") loadPatronData();
  }
}

async function loadEmployeData() {
  const { data } = await db
    .from("transactions")
    .select("*")
    .eq("created_by", currentUser.id)
    .order("created_at", { ascending: false });
  const tbody = document.getElementById("emp-history-body");

  if (data && data.length > 0) {
    tbody.innerHTML = "";
    data.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      tbody.innerHTML += `<tr><td>${new Date(t.created_at).toLocaleDateString()}</td><td><span class="badge-type ${badgeClass}">${t.type.toUpperCase()}</span></td><td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td><td class="${t.type === "vente" ? "text-success" : "text-danger"}">${cost.toFixed(2)} Septims</td></tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Vous n'avez encore effectué aucune opération.</p></div></td></tr>`;
  }
}

// ==========================================
// --- VUE GESTION (PATRON UNIQUEMENT) ---
// ==========================================
async function loadPatronData() {
  const { data: personnel, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  const personnelDiv = document.getElementById("admin-personnel-list");
  const salDiv = document.getElementById("admin-salaries-list");

  personnelDiv.innerHTML = "";
  salDiv.innerHTML = "";

  if (error) {
    personnelDiv.innerHTML = `<p class="text-danger">Erreur : ${error.message}</p>`;
  } else if (!personnel || personnel.length === 0) {
    personnelDiv.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users-slash"></i><p>Aucun employé enregistré.</p></div>`;
    salDiv.innerHTML = `<div class="empty-state"><p>Aucun contrat.</p></div>`;
  } else {
    personnel.forEach((p) => {
      const isMe = p.id === currentUser.id;
      let actionHtml = "";

      if (p.is_approved) {
        actionHtml = `<button class="btn-action btn-fire" onclick="event.stopPropagation(); virerUtilisateur('${p.id}', '${p.full_name}')" ${isMe ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ""}><i class="fa-solid fa-trash"></i></button>`;
      } else {
        actionHtml = `<button class="btn-action btn-validate" onclick="event.stopPropagation(); validerUtilisateur('${p.id}')"><i class="fa-solid fa-check"></i></button>
                              <button class="btn-action btn-fire" onclick="event.stopPropagation(); virerUtilisateur('${p.id}', '${p.full_name}')"><i class="fa-solid fa-trash"></i></button>`;
      }

      // Bouton Contremaître (seulement si validé et n'est pas déjà contremaître ou patron)
      if (p.is_approved && p.role === "employe" && !isMe) {
        actionHtml =
          `<button class="btn-action btn-contremaitre" onclick="event.stopPropagation(); changerRole('${p.id}', 'contremaitre')" title="Nommer Contremaître"><i class="fa-solid fa-hard-hat"></i></button>` +
          actionHtml;
      }
      if (p.is_approved && p.role === "contremaitre" && !isMe) {
        actionHtml =
          `<button class="btn-action btn-secondary" onclick="event.stopPropagation(); changerRole('${p.id}', 'employe')" title="Rétrograder Employé"><i class="fa-solid fa-arrow-down"></i></button>` +
          actionHtml;
      }
      if (p.role === "employe" && p.is_approved && !isMe) {
        actionHtml =
          `<button class="btn-action btn-promote" onclick="event.stopPropagation(); changerRole('${p.id}', 'patron')" title="Promouvoir Patron"><i class="fa-solid fa-crown"></i></button>` +
          actionHtml;
      }

      let roleBadge = "Employé";
      let badgeColor = "var(--text-muted)";
      if (p.role === "patron") {
        roleBadge = "Patron";
        badgeColor = "var(--primary)";
      }
      if (p.role === "contremaitre") {
        roleBadge = "Contremaître";
        badgeColor = "#3498db";
      }

      const statusBadge = p.is_approved
        ? ""
        : '<span style="color:var(--danger); font-weight:bold;">(En attente)</span>';

      personnelDiv.innerHTML += `
                <div class="personnel-row" style="cursor: pointer;" onclick="showUserHistory('${p.id}', '${p.full_name}')">
                    <div class="personnel-info"><strong>${p.full_name} ${isMe ? "(Vous)" : ""}</strong><span>Rôle : <span style="color:${badgeColor}; font-weight:bold;">${roleBadge}</span> ${statusBadge}</span></div>
                    <div class="personnel-actions">${actionHtml}</div>
                </div>`;

      if (p.is_approved) {
        salDiv.innerHTML += `
                    <div class="salary-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <span style="flex:1; font-weight:500;">${p.full_name}</span>
                        <input type="number" value="${p.salary || 0}" id="sal-amount-${p.id}" placeholder="0" style="width:80px;">
                        <span style="font-size:0.8em; color:var(--text-muted);">S</span>
                    </div>`;
      }
    });
    if (salDiv.innerHTML === "")
      salDiv.innerHTML = `<div class="empty-state"><p>Aucun employé validé.</p></div>`;
  }

  const { data: allTransactions } = await db
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  const filtered = getFilteredTransactions(allTransactions);
  const tbody = document.getElementById("admin-history-body");

  if (filtered && filtered.length > 0) {
    tbody.innerHTML = "";
    let totalAchats = 0,
      totalVentes = 0,
      totalSalairesPayes = 0;

    filtered.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      if (t.type === "achat") totalAchats += cost;
      else if (t.type === "salaire") totalSalairesPayes += cost;
      else totalVentes += cost;

      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";

      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td>${t.counterparty_name}</td>
                    <td><span class="badge-type ${badgeClass}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${cost.toFixed(2)} S</td>
                    <td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td>
                </tr>`;
    });

    const totalDepenses = totalAchats + totalSalairesPayes;
    document.getElementById("stat-ventes").innerText =
      totalVentes.toFixed(2) + " S";
    document.getElementById("stat-achats").innerText =
      totalDepenses.toFixed(2) + " S";

    const benefice = totalVentes - totalDepenses;
    const elBenefice = document.getElementById("stat-benefice");
    elBenefice.innerText = benefice.toFixed(2) + " S";
    elBenefice.className = benefice >= 0 ? "text-success" : "text-danger";

    renderCharts(filtered);
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-list"></i><p>Aucune transaction.</p></div></td></tr>`;
    document.getElementById("stat-ventes").innerText = "0.00 S";
    document.getElementById("stat-achats").innerText = "0.00 S";
    document.getElementById("stat-benefice").innerText = "0.00 S";
    renderCharts([]);
  }
}

// ==========================================
// --- HISTORIQUE INDIVIDUEL & GRAPHIQUES ---
// ==========================================
async function showUserHistory(userId, userName) {
  document.getElementById("user-history-title").innerText =
    `Historique de ${userName}`;
  document.getElementById("user-history-body").innerHTML =
    '<tr><td colspan="4" class="text-center">Chargement...</td></tr>';
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
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";

      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span class="badge-type ${badgeClass}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${cost.toFixed(2)} Septims</td>
                </tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Aucune transaction pour cet employé.</p></div></td></tr>`;
  }
}
function closeUserHistory() {
  document.getElementById("user-history-modal").style.display = "none";
}

function renderCharts(transactions) {
  let achats = {
    "Petit bois": 0,
    "Charbon Pauvre": 0,
    "Charbon Normale": 0,
    "Briquettes de Charbon": 0,
    "Coke de charbon": 0,
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
    if (t.type === "achat" && achats[t.item_type] !== undefined)
      achats[t.item_type] += cost;
    if (t.type === "vente" && ventes[t.item_type] !== undefined)
      ventes[t.item_type] += cost;
  });

  if (chartAchatsInstance) chartAchatsInstance.destroy();
  if (chartVentesInstance) chartVentesInstance.destroy();

  const ctxA = document.getElementById("chart-achats").getContext("2d");
  chartAchatsInstance = new Chart(ctxA, {
    type: "doughnut",
    data: {
      labels: Object.keys(achats).filter((k) => achats[k] > 0),
      datasets: [
        {
          data: Object.values(achats).filter((v) => v > 0),
          backgroundColor: Object.keys(achats)
            .filter((k) => achats[k] > 0)
            .map((l) => typeColors[l] || "#888"),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: "#f0f0f0" } } },
    },
  });

  const ctxV = document.getElementById("chart-ventes").getContext("2d");
  chartVentesInstance = new Chart(ctxV, {
    type: "doughnut",
    data: {
      labels: Object.keys(ventes).filter((k) => ventes[k] > 0),
      datasets: [
        {
          data: Object.values(ventes).filter((v) => v > 0),
          backgroundColor: Object.keys(ventes)
            .filter((k) => ventes[k] > 0)
            .map((l) => typeColors[l] || "#888"),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: "#f0f0f0" } } },
    },
  });
}

// ==========================================
// --- ACTIONS PATRON (GESTION PERSONNEL) ---
// ==========================================
async function validerUtilisateur(id) {
  const { error } = await db
    .from("profiles")
    .update({ is_approved: true })
    .eq("id", id);
  if (error) showPopup("Erreur", "Impossible.");
  else {
    showPopup("Validé", "Le joueur peut travailler.");
    loadPatronData();
  }
}

async function changerRole(id, nouveauRole) {
  const roleNom =
    nouveauRole === "patron"
      ? "Patron"
      : nouveauRole === "contremaitre"
        ? "Contremaître"
        : "Employé";
  showConfirm(
    "Changement de rôle",
    `Nommer cet utilisateur ${roleNom} ?`,
    async () => {
      const { error } = await db
        .from("profiles")
        .update({ role: nouveauRole })
        .eq("id", id);
      if (error) showPopup("Erreur", "Impossible de changer le rôle.");
      else {
        showPopup("Succès", `Le joueur est maintenant ${roleNom}.`);
        loadPatronData();
      }
    },
  );
}

async function virerUtilisateur(id, nom) {
  showConfirm("Virer", `VIRER ${nom} ?`, async () => {
    const { error } = await db.rpc("supprimer_utilisateur", {
      target_user_id: id,
    });
    if (error) showPopup("Erreur", "Erreur SQL.");
    else {
      showPopup("Viré", `${nom} supprimé.`);
      loadPatronData();
    }
  });
}

async function deleteTransaction(id) {
  showConfirm("Supprimer", "Supprimer cette transaction ?", async () => {
    await db.from("transactions").delete().eq("id", id);
    loadPatronData();
    loadEmployeData();
  });
}

// ==========================================
// --- SALAIRES (SAUVEGARDE ET PAIEMENT) ---
// ==========================================
async function saveSalaries() {
  const inputs = document.querySelectorAll('[id^="sal-amount-"]');
  if (inputs.length === 0) return showPopup("Info", "Aucun employé à payer.");

  let updates = [];
  inputs.forEach((input) => {
    const id = input.id.replace("sal-amount-", "");
    const salary = parseFloat(input.value) || 0;
    updates.push({ id: id, salary: salary });
  });

  const { error } = await db.from("profiles").upsert(updates);

  if (error) {
    console.error(error);
    showPopup("Erreur", "Impossible de sauvegarder les salaires.");
  } else {
    showPopup("Sauvegardé", "Les salaires ont été enregistrés.");
    loadPatronData();
  }
}

async function paySalaries() {
  const { data: personnel } = await db
    .from("profiles")
    .select("*")
    .eq("is_approved", true);
  const toPay = personnel.filter((p) => p.salary > 0);

  if (toPay.length === 0) {
    return showPopup(
      "Info",
      "Aucun salaire à payer (les montants sont à 0). N'oubliez pas de cliquer sur 'Sauvegarder' avant de payer.",
    );
  }

  showConfirm(
    "Payer les salaires",
    `Payer un total de ${toPay.reduce((acc, curr) => acc + curr.salary, 0)} Septims ?`,
    async () => {
      let totalPaye = 0;
      const transactionsToInsert = toPay.map((p) => {
        totalPaye += p.salary;
        return {
          type: "salaire",
          item_type: "Salaire",
          counterparty_name: p.full_name,
          quantity: 1,
          unit_price: p.salary,
          created_by: currentUser.id,
        };
      });

      const { error } = await db
        .from("transactions")
        .insert(transactionsToInsert);

      if (error) {
        showPopup("Erreur", error.message);
      } else {
        showPopup(
          "Salaires Payés",
          `${totalPaye.toFixed(2)} Septims distribués.`,
        );
        loadPatronData();
      }
    },
  );
}

// ==========================================
// --- DÉMARRAGE ---
// ==========================================
db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    checkUserStatus();
  }
});
