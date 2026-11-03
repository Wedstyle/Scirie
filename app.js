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

// ==========================================
// --- REALTIME (MISE À JOUR EN DIRECT) ---
// ==========================================
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
        if (isTyping()) return;
        loadPatronData();
        loadEmployeData();
        loadTreasury();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "stocks" },
      () => {
        if (isTyping()) return;
        loadStock();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => {
        if (isTyping()) return;
        loadPatronData();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "barrel_rentals" },
      () => {
        if (isTyping()) return;
        loadBarrels();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "furnace_rentals" },
      () => {
        if (isTyping()) return;
        loadFurnaces();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      () => {
        if (isTyping()) return;
        loadOrders();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED")
        console.log("✅ Connecté au flux temps réel.");
    });
}

// ==========================================
// --- TRÉSORERIE (PATRON) ---
// ==========================================
async function loadTreasury() {
  if (!userProfile || userProfile.role !== "patron") return;
  const { data: transactions } = await db.from("transactions").select("*");
  if (!transactions) return;
  let totalAchats = 0,
    totalVentes = 0,
    totalSalaires = 0,
    totalAjustements = 0;
  transactions.forEach((t) => {
    const cost = t.quantity * t.unit_price;
    if (t.type === "achat") totalAchats += cost;
    else if (t.type === "salaire") totalSalaires += cost;
    else if (t.type === "vente") totalVentes += cost;
    else if (t.type === "ajustement") totalAjustements += cost;
  });
  const treasury = totalVentes - totalAchats - totalSalaires + totalAjustements;
  const el = document.getElementById("current-treasury");
  if (el) el.value = Math.floor(treasury);
}

async function updateTreasuryDirect(input) {
  const newValue = parseInt(input.value);
  if (isNaN(newValue) || newValue < 0) return loadTreasury();
  const { data: transactions } = await db.from("transactions").select("*");
  let totalAchats = 0,
    totalVentes = 0,
    totalSalaires = 0,
    totalAjustements = 0;
  transactions.forEach((t) => {
    const cost = t.quantity * t.unit_price;
    if (t.type === "achat") totalAchats += cost;
    else if (t.type === "salaire") totalSalaires += cost;
    else if (t.type === "vente") totalVentes += cost;
    else if (t.type === "ajustement") totalAjustements += cost;
  });
  const currentTreasury = Math.floor(
    totalVentes - totalAchats - totalSalaires + totalAjustements,
  );
  const difference = newValue - currentTreasury;
  if (difference === 0) return;
  showConfirm(
    "Modification directe",
    `Voulez-vous ajuster la trésorerie de ${difference > 0 ? "+" : ""}${difference} Septims ?`,
    async () => {
      const { error } = await db
        .from("transactions")
        .insert({
          type: "ajustement",
          item_type: "Ajustement",
          counterparty_name: "Modification directe (Patron)",
          quantity: 1,
          unit_price: difference,
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
  const amountInput = document.getElementById("manual-amount");
  const amount = parseInt(amountInput.value);
  if (!amount || amount <= 0)
    return showPopup("Erreur", "Veuillez entrer un montant supérieur à 0.");
  const amountValue = type === 1 ? amount : -amount;
  const action = type === 1 ? "Ajouter" : "Retirer";
  showConfirm(
    `Ajustement`,
    `Voulez-vous ${action.toLowerCase()} ${amount} Septims ?`,
    async () => {
      const { error } = await db
        .from("transactions")
        .insert({
          type: "ajustement",
          item_type: "Ajustement",
          counterparty_name: `Manuel (Patron - ${action})`,
          quantity: 1,
          unit_price: amountValue,
          created_by: currentUser.id,
        });
      if (error) showPopup("Erreur", error.message);
      else {
        showPopup("Succès", `${amount} Septims ${action.toLowerCase()}s.`);
        amountInput.value = "";
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
    container.innerHTML = `<p class="text-danger">Erreur de chargement.</p>`;
    return;
  }

  if (stocks && stocks.length > 0) {
    stocks.forEach((s) => {
      const color = typeColors[s.item_name] || "#888";
      const textColor = s.item_name === "Charbon Normale" ? "#333" : "#fff";
      const controlsHtml =
        userProfile.role === "patron"
          ? `
                <div class="stock-controls">
                    <input type="number" id="stock-qty-${s.id}" placeholder="Quantité" min="1">
                    <div class="stock-buttons">
                        <button class="btn-add" onclick="adjustStock(${s.id}, ${s.quantity}, 1)"><i class="fa-solid fa-plus"></i> Ajouter</button>
                        <button class="btn-sub" onclick="adjustStock(${s.id}, ${s.quantity}, -1)"><i class="fa-solid fa-minus"></i> Retirer</button>
                    </div>
                </div>
            `
          : "";
      container.innerHTML += `
                <div class="stock-item" style="border-left-color: ${color};">
                    <h4 style="background-color: ${color}; color: ${textColor};">${s.item_name}</h4>
                    <div class="qty">${s.quantity}</div>
                    ${controlsHtml}
                </div>
            `;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-boxes-stacked"></i><p>Le stock est vide.</p></div>`;
  }
}

async function adjustStock(id, currentQty, operation) {
  const input = document.getElementById(`stock-qty-${id}`);
  const amount = parseInt(input.value);
  if (!amount || amount <= 0) return showPopup("Erreur", "Quantité invalide.");
  let newQty = operation === 1 ? currentQty + amount : currentQty - amount;
  if (newQty < 0) newQty = 0;
  const { error } = await db
    .from("stocks")
    .update({ quantity: newQty })
    .eq("id", id);
  if (error) showPopup("Erreur", "Impossible de modifier le stock.");
  else {
    input.value = "";
    loadStock();
  }
}

// ==========================================
// --- SAISIE DIRECTE (AVEC DIVERS & DÉCIMALES) ---
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

  if (select.value !== "Divers") {
    select.style.backgroundColor = typeColors[item] || "#333";
    select.style.color = item === "Charbon Normale" ? "#333" : "#fff";
  } else {
    select.style.backgroundColor = "transparent";
    select.style.color = "var(--text-main)";
  }
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
    if (!customName)
      return showPopup("Erreur", "Veuillez préciser ce que vous achetez.");
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
        `Il ne reste que ${stock.quantity} ${item_type}.`,
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
    showPopup("Succès", "Opération enregistrée !");
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
    personnelDiv.innerHTML = `<p class="text-danger">Erreur : ${error.message}</p>`;
  } else if (!personnel || personnel.length === 0) {
    personnelDiv.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users-slash"></i><p>Aucun employé.</p></div>`;
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
      if (p.is_approved && p.role === "employe" && !isMe) {
        actionHtml =
          `<button class="btn-action btn-contremaitre" onclick="event.stopPropagation(); changerRole('${p.id}', 'contremaitre')" title="Contremaître"><i class="fa-solid fa-hard-hat"></i></button>` +
          actionHtml;
      }
      if (p.is_approved && p.role === "contremaitre" && !isMe) {
        actionHtml =
          `<button class="btn-action btn-secondary" onclick="event.stopPropagation(); changerRole('${p.id}', 'employe')" title="Employé"><i class="fa-solid fa-arrow-down"></i></button>` +
          actionHtml;
      }
      if (p.role === "employe" && p.is_approved && !isMe) {
        actionHtml =
          `<button class="btn-action btn-promote" onclick="event.stopPropagation(); changerRole('${p.id}', 'patron')" title="Patron"><i class="fa-solid fa-crown"></i></button>` +
          actionHtml;
      }
      let roleBadge = "Employé",
        badgeColor = "var(--text-muted)";
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
                    <div class="salary-row">
                        <span>${p.full_name}</span>
                        <input type="number" value="${p.salary || 0}" id="sal-amount-${p.id}" oninput="updateSalaryTotal()" placeholder="0" step="1">
                    </div>`;
      }
    });
    if (salDiv.innerHTML === "")
      salDiv.innerHTML = `<div class="empty-state"><p>Aucun employé validé.</p></div>`;
  }

  updateSalaryTotal();

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
      else if (t.type === "vente") totalVentes += cost;

      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass = "bg-secondary",
        textClass = "text-muted";

      if (t.type === "vente") {
        badgeClass = "bg-green";
        textClass = "text-success";
      }
      if (t.type === "achat") {
        badgeClass = "bg-red";
        textClass = "text-danger";
      }
      if (t.type === "salaire") {
        badgeClass = "bg-purple";
        textClass = "text-danger";
      }
      if (t.type === "ajustement") {
        badgeClass = "bg-blue";
        textClass = cost >= 0 ? "text-success" : "text-danger";
      }

      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td>${t.counterparty_name}</td>
                    <td><span class="badge-type ${badgeClass}" style="${t.type === "ajustement" ? "background-color: #3b82f6; color: white;" : ""}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td>${t.quantity}</td>
                    <td>${parseFloat(t.unit_price).toFixed(2)} S</td> <!-- AJOUT ICI -->
                    <td class="${textClass}">${Math.round(cost)} S</td>
                    <td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td>
                </tr>`;
    });

    const totalDepenses = totalAchats + totalSalairesPayes;
    document.getElementById("stat-ventes").innerText =
      Math.round(totalVentes) + " S";
    document.getElementById("stat-achats").innerText =
      Math.round(totalDepenses) + " S";

    const benefice = totalVentes - totalDepenses;
    const elBenefice = document.getElementById("stat-benefice");
    elBenefice.innerText = Math.round(benefice) + " S";
    elBenefice.className = benefice >= 0 ? "text-success" : "text-danger";

    renderCharts(filtered);
  } else {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-list"></i><p>Aucune transaction.</p></div></td></tr>`;
    document.getElementById("stat-ventes").innerText = "0 S";
    document.getElementById("stat-achats").innerText = "0 S";
    document.getElementById("stat-benefice").innerText = "0 S";
    renderCharts([]);
  }
}

// ==========================================
// --- HISTORIQUE & GRAPHIQUES ---
// ==========================================
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

  const labelsAchats = Object.keys(achats).filter((k) => achats[k] > 0);
  const dataAchats = labelsAchats.map((k) => achats[k]);
  const labelsVentes = Object.keys(ventes).filter((k) => ventes[k] > 0);
  const dataVentes = labelsVentes.map((k) => ventes[k]);

  if (chartAchatsInstance) chartAchatsInstance.destroy();
  if (chartVentesInstance) chartVentesInstance.destroy();

  const commonOptions = {
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

  const ctxA = document.getElementById("chart-achats").getContext("2d");
  if (labelsAchats.length === 0) {
    chartAchatsInstance = new Chart(ctxA, {
      type: "doughnut",
      data: {
        labels: ["Vide"],
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
            backgroundColor: labelsAchats.map((l) => typeColors[l] || "#888"),
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
        labels: ["Vide"],
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
            backgroundColor: labelsVentes.map((l) => typeColors[l] || "#888"),
            borderWidth: 0,
            cutout: "60%",
          },
        ],
      },
      options: commonOptions,
    });
  }
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
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") badgeClass = "bg-blue";

      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span class="badge-type ${badgeClass}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td>${t.quantity}</td>
                    <td>${parseFloat(t.unit_price).toFixed(2)} S</td> <!-- AJOUT ICI -->
                    <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td>
                </tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Aucune transaction.</p></div></td></tr>`;
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
      if (error) showPopup("Erreur", "Impossible.");
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
    loadTreasury();
  });
}

async function paySalaries() {
  const inputs = document.querySelectorAll('[id^="sal-amount-"]');
  if (inputs.length === 0) return showPopup("Info", "Aucun employé à payer.");
  let totalPaye = 0,
    transactionsToInsert = [],
    updates = [];

  for (const input of inputs) {
    const id = input.id.replace("sal-amount-", "");
    const salary = parseInt(input.value) || 0;
    if (salary > 0) {
      const nom = input.closest(".salary-row").querySelector("span").innerText;
      totalPaye += salary;
      updates.push({ id: id, salary: salary });
      transactionsToInsert.push({
        type: "salaire",
        item_type: "Salaire",
        counterparty_name: nom,
        quantity: 1,
        unit_price: salary,
        created_by: currentUser.id,
      });
    }
  }
  if (totalPaye === 0)
    return showPopup("Info", "Le total des salaires est de 0.");

  showConfirm(
    "Payer l'équipe",
    `Confirmer le paiement de ${totalPaye} Septims ?`,
    async () => {
      for (const update of updates)
        await db
          .from("profiles")
          .update({ salary: update.salary })
          .eq("id", update.id);
      const { error } = await db
        .from("transactions")
        .insert(transactionsToInsert);
      if (error) showPopup("Erreur", error.message);
      else {
        showPopup("Salaires Payés", `${totalPaye} Septims distribués.`);
        loadPatronData();
        loadEmployeData();
        loadTreasury();
      }
    },
  );
}

// ==========================================
// --- TONNEAUX (PRIX PAR TONNEAU) ---
// ==========================================
async function loadBarrels() {
  const { data: rentals } = await db.from("barrel_rentals").select("*");
  const container = document.querySelector("#tab-location .barrels-grid");
  if (!container) return;

  if (container.innerHTML.trim() === "") {
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

      let priceHtml = `
                <div class="barrel-price-container">
                    <span style="color: var(--text-muted); font-size: 0.9em;">Prix :</span> 
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="color: var(--primary); font-weight: bold; font-family: 'Cinzel';">${rental.price || 50}</span>
                        <span style="color: var(--primary); font-weight: bold;">S</span>
                    </div>
                </div>`;

      if (userProfile.role === "patron") {
        priceHtml = `
                <div class="barrel-price-container" onclick="this.querySelector('input').focus()">
                    <span style="color: var(--text-muted); font-size: 0.9em;">Prix :</span> 
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" class="barrel-price-input" value="${rental.price || 50}" onchange="updateBarrelPrice(${rental.id}, this.value)">
                        <span style="color: var(--primary); font-weight: bold;">S</span>
                        <i class="fa-solid fa-pen" style="color: var(--text-muted); font-size: 0.8em; margin-left: 5px;"></i>
                    </div>
                </div>`;
      }

      if (rental.last_payment_date) {
        const lastPay = new Date(rental.last_payment_date);
        const nextPay = new Date(lastPay);
        nextPay.setDate(nextPay.getDate() + 7);
        const diffDays = Math.ceil(
          (nextPay.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        const options = { day: "2-digit", month: "2-digit", year: "numeric" };
        if (diffDays < 0) {
          card.classList.add("late");
          statusEl.innerText = "En retard";
          payInfoEl.innerHTML = `${priceHtml}<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Dû le : ${nextPay.toLocaleDateString("fr-FR", options)}</span><span style="color: var(--danger); font-weight: bold;">Retard de ${Math.abs(diffDays)}j</span>`;
        } else {
          card.classList.add("paid");
          statusEl.innerText = "À jour";
          payInfoEl.innerHTML = `${priceHtml}<span>Dernier : ${lastPay.toLocaleDateString("fr-FR", options)}</span><span class="next-pay-date">Prochain : <strong>${nextPay.toLocaleDateString("fr-FR", options)}</strong></span><span>Dans ${diffDays}j</span>`;
        }
      } else {
        card.classList.add("late");
        statusEl.innerText = "Jamais payé";
        payInfoEl.innerHTML = `${priceHtml}<span style="color: var(--danger);">Aucun paiement</span>`;
      }

      actionsEl.innerHTML = `<button class="btn-pay" onclick="payBarrel(${rental.id}, ${i}, '${rental.client_name}')"><i class="fa-solid fa-coins"></i> Encaisser</button><button class="btn-free" onclick="freeBarrel(${rental.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
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
  const clientName = document
    .getElementById("allocate-client-name")
    .value.trim();
  const price =
    parseFloat(document.getElementById("allocate-price").value) || 50;
  if (!clientName)
    return showPopup("Erreur", "Veuillez entrer un nom de client.");
  if (!currentBarrelToAllocate) return;
  const { error } = await db
    .from("barrel_rentals")
    .insert({
      barrel_number: currentBarrelToAllocate,
      client_name: clientName,
      price: price,
    });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", `Tonneau n°${currentBarrelToAllocate} alloué.`);
    closeAllocateModal();
    loadBarrels();
  }
}

async function updateBarrelPrice(id, newPrice) {
  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) return loadBarrels();
  const { error } = await db
    .from("barrel_rentals")
    .update({ price: price })
    .eq("id", id);
  if (error) showPopup("Erreur", "Impossible de modifier le prix.");
  else loadBarrels();
}

async function payBarrel(id, num, clientName) {
  let finalPrice = 50;

  const card = document.getElementById(`barrel-${num}`);
  if (card) {
    const priceInput = card.querySelector('input[type="number"]');
    if (priceInput) {
      finalPrice = parseFloat(priceInput.value) || 50;
      await db
        .from("barrel_rentals")
        .update({ price: finalPrice })
        .eq("id", id);
    } else {
      const { data } = await db
        .from("barrel_rentals")
        .select("price")
        .eq("id", id)
        .single();
      if (data && data.price) finalPrice = data.price;
    }
  }

  showConfirm(
    "Encaisser",
    `Encaisser ${finalPrice} Septims pour le tonneau n°${num} (${clientName}) ?`,
    async () => {
      const { error: errRental } = await db
        .from("barrel_rentals")
        .update({ last_payment_date: new Date().toISOString() })
        .eq("id", id);
      if (errRental)
        return showPopup("Erreur", "Erreur lors de l'encaissement.");

      await db.from("transactions").insert({
        type: "vente",
        item_type: "Location tonneau",
        counterparty_name: clientName,
        quantity: 1,
        unit_price: finalPrice,
        created_by: currentUser.id,
      });

      showPopup("Payé", `${finalPrice} Septims encaissés.`);
      loadBarrels();
      if (userProfile.role === "patron") {
        loadPatronData();
        loadTreasury();
      }
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
      let cardClass = "free",
        statusText = "Libre",
        payInfo = "",
        actionsHtml = "";
      if (f.last_payment_date) {
        const lastPay = new Date(f.last_payment_date);
        const nextPay = new Date(lastPay);
        nextPay.setDate(nextPay.getDate() + 7);
        const diffDays = Math.ceil(
          (nextPay.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
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
      if (userProfile.role === "patron")
        actionsHtml += `<button class="btn-free" onclick="freeFurnace(${f.id})"><i class="fa-solid fa-trash"></i> Libérer</button>`;
      container.innerHTML += `
                <div class="barrel-card ${cardClass}">
                    <div class="barrel-header"><h3>Four</h3><span class="status-badge">${statusText}</span></div>
                    <div class="barrel-body"><div class="client-name"><i class="fa-solid fa-user"></i> ${f.client_name}</div><div class="pay-info">${payInfo}</div></div>
                    <div class="barrel-actions">${actionsHtml}</div>
                </div>`;
    });
  } else {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-fire"></i><p>Aucun client.</p></div>`;
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
  if (!clientName) return showPopup("Erreur", "Veuillez entrer un nom.");
  const { error } = await db
    .from("furnace_rentals")
    .insert({ client_name: clientName, created_by: currentUser.id });
  if (error) showPopup("Erreur", error.message);
  else {
    showPopup("Succès", `Client ajouté.`);
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
      await db
        .from("transactions")
        .insert({
          type: "vente",
          item_type: "Location four",
          counterparty_name: clientName,
          quantity: 1,
          unit_price: 30,
          created_by: currentUser.id,
        });
      showPopup("Payé", `30 Septims encaissés.`);
      loadFurnaces();
      if (userProfile.role === "patron") {
        loadPatronData();
        loadTreasury();
      }
      loadEmployeData();
    },
  );
}

async function freeFurnace(id) {
  showConfirm(
    "Libérer",
    "Voulez-vous vraiment supprimer ce client ?",
    async () => {
      await db.from("furnace_rentals").delete().eq("id", id);
      loadFurnaces();
    },
  );
}

// ==========================================
// --- COMMANDES ---
// ==========================================
async function createOrder(e) {
  e.preventDefault();
  const client_name = document.getElementById("ord-client").value.trim();
  const item_type = document.getElementById("ord-item").value;
  const quantity = parseFloat(document.getElementById("ord-qty").value);
  const unit_price = parseFloat(document.getElementById("ord-price").value);
  const deadline = document.getElementById("ord-deadline").value || null;

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
  if (!container) return;
  if (orders && orders.length > 0) {
    container.innerHTML = "";
    orders.forEach((o) => {
      const color = typeColors[o.item_type] || "#888";
      const total = Math.round(o.quantity * o.unit_price);
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
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>Aucune commande.</p></div>`;
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
  if (userProfile.role === "patron") {
    loadPatronData();
    loadTreasury();
  }
}

async function cancelOrder(id) {
  showConfirm("Annuler", "Annuler cette commande ?", async () => {
    await db.from("orders").delete().eq("id", id);
    loadOrders();
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
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      let badgeClass =
        t.type === "vente"
          ? "bg-green"
          : t.type === "salaire"
            ? "bg-purple"
            : "bg-red";
      if (t.type === "ajustement") badgeClass = "bg-blue";

      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span class="badge-type ${badgeClass}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td>${t.quantity}</td>
                    <td>${parseFloat(t.unit_price).toFixed(2)} S</td> <!-- AJOUT ICI -->
                    <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${Math.round(cost)} Septims</td>
                </tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Aucune opération.</p></div></td></tr>`;
  }
}

// --- DÉMARRAGE ---
db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    checkUserStatus();
  }
});
