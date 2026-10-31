const SUPABASE_URL = "https://ifbvulvyhledklktzjrv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYnZ1bHZ5aGxlZGtsa3R6anJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTE4OTUsImV4cCI6MjEwODk2Nzg5NX0.V0RQSqrZWVUIXprRjy5z5ax-4e8MT51yclDgpbf0oSc";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userProfile = null;
let chartAchatsInstance = null;
let chartVentesInstance = null;

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
};

// --- UI HELPERS ---
function showPopup(title, message) {
  document.getElementById("popup-title").innerText = title;
  document.getElementById("popup-message").innerText = message;
  document.getElementById("custom-popup").style.display = "flex";
}
function closePopup() {
  document.getElementById("custom-popup").style.display = "none";
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

// --- AUTHENTIFICATION ---
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

// --- INITIALISATION & RÔLES ---
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
  document.getElementById("user-role-badge").innerText =
    profile.role === "patron" ? "Patron" : "Employé";

  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("pending-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";

  if (profile.role === "patron") {
    document.getElementById("nav-historique").style.display = "none";
    document.getElementById("nav-gestion").style.display = "flex";
    switchTab("tab-gestion", document.getElementById("nav-gestion"));
    loadPatronData();
    loadEmployeData();
  } else {
    if (!profile.is_approved) {
      document.getElementById("app-screen").style.display = "none";
      document.getElementById("pending-screen").style.display = "flex";
      return;
    }
    document.getElementById("nav-historique").style.display = "flex";
    document.getElementById("nav-gestion").style.display = "none";
    switchTab("tab-commandes", document.querySelector(".nav-btn"));
    loadEmployeData();
  }

  loadStock();
  loadOrders();
  updateBasePrice();
}

// --- GESTION DES COMMANDES ---
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
  container.innerHTML = "";

  if (orders && orders.length > 0) {
    orders.forEach((o) => {
      const color = typeColors[o.item_type] || "#888";
      const total = (o.quantity * o.unit_price).toFixed(2);
      let dateHtml = o.deadline
        ? `<span class="text-warning" style="display:block; margin-top:8px;"><i class="fa-solid fa-clock"></i> Avant le : ${new Date(o.deadline).toLocaleDateString()}</span>`
        : "";

      container.innerHTML += `
                <div class="order-card" style="border-left-color: ${color};">
                    <div>
                        <h4>${o.item_type}</h4>
                        <div class="client">Client : ${o.client_name}</div>
                        <div class="details">
                            <span><strong>Quantité :</strong> ${o.quantity}</span>
                            <span><strong>Prix U. :</strong> ${o.unit_price} Septims</span>
                            <span><strong>Total :</strong> ${total} Septims</span>
                            ${dateHtml}
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-honor" onclick="honorOrder(${o.id}, '${o.client_name}', '${o.item_type}', ${o.quantity}, ${o.unit_price})"><i class="fa-solid fa-check"></i> Honorer</button>
                        <button class="btn-cancel" onclick="cancelOrder(${o.id})"><i class="fa-solid fa-xmark"></i> Annuler</button>
                    </div>
                </div>
            `;
    });
  } else {
    container.innerHTML =
      '<p class="text-muted">Aucune commande en attente.</p>';
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
      `Il n'y a que ${stock.quantity} ${item_type} en stock.`,
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

  showPopup("Commande Honorée", "Vente enregistrée et stock mis à jour !");
  loadOrders();
  loadStock();
  loadEmployeData();
  if (userProfile.role === "patron") loadPatronData();
}

async function cancelOrder(id) {
  if (!confirm("Annuler cette commande ?")) return;
  await db.from("orders").delete().eq("id", id);
  loadOrders();
}

// --- GESTION DU STOCK ---
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

      container.innerHTML += `
                <div class="stock-item" style="border-left-color: ${color};">
                    <h4 style="background-color: ${color}; color: ${textColor};">${s.item_name}</h4>
                    ${qtyHtml}
                </div>
            `;
    });
  }
}

async function updateStockManual(id, newQty) {
  await db
    .from("stocks")
    .update({ quantity: parseFloat(newQty) || 0 })
    .eq("id", id);
}

// --- SAISIE DIRECTE ---
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
  tbody.innerHTML = "";
  if (data) {
    data.forEach((t) => {
      const cost = t.quantity * t.unit_price;
      const color = typeColors[t.item_type] || "#888";
      const textColor = t.item_type === "Charbon Normale" ? "#333" : "#fff";
      tbody.innerHTML += `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span class="badge-type ${t.type === "vente" ? "bg-green" : t.type === "salaire" ? "bg-purple" : "bg-red"}">${t.type.toUpperCase()}</span></td>
                    <td><span class="badge-type" style="background-color: ${color}; color: ${textColor};">${t.item_type}</span></td>
                    <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${cost.toFixed(2)} Septims</td>
                </tr>`;
    });
  }
}

// --- VUE GESTION (PATRON) ---
async function loadPatronData() {
  // Demandes d'embauche
  const { data: pending } = await db
    .from("profiles")
    .select("*")
    .eq("is_approved", false);
  const pendDiv = document.getElementById("admin-pending-list");
  pendDiv.innerHTML = pending.length
    ? ""
    : '<p class="text-muted">Aucune demande.</p>';
  if (pending)
    pending.forEach(
      (p) =>
        (pendDiv.innerHTML += `<div class="pending-user"><span>${p.full_name}</span><button onclick="approveUser('${p.id}')">Valider</button></div>`),
    );

  // Salaires (Contrats)
  const { data: employees } = await db.from("employees").select("*");
  const salDiv = document.getElementById("admin-salaries-list");
  salDiv.innerHTML = "";
  employees.forEach(
    (e) =>
      (salDiv.innerHTML += `<div class="salary-row"><input type="text" value="${e.name}" id="sal-name-${e.id}"><input type="number" value="${e.salary}" id="sal-amount-${e.id}"></div>`),
  );

  // Transactions Globales
  const { data: transactions } = await db
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  const tbody = document.getElementById("admin-history-body");
  tbody.innerHTML = "";

  let totalAchats = 0,
    totalVentes = 0,
    totalSalairesPayes = 0;

  transactions.forEach((t) => {
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
                <td class="${t.type === "vente" ? "text-success" : "text-danger"}">${cost.toFixed(2)} Septims</td>
                <td><button class="btn-icon text-danger" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
  });

  // Calcul du vrai Bénéfice Net (Ventes - Achats - Salaires payés)
  const totalDepenses = totalAchats + totalSalairesPayes;
  document.getElementById("stat-ventes").innerText =
    totalVentes.toFixed(2) + " Septims";
  document.getElementById("stat-achats").innerText =
    totalDepenses.toFixed(2) + " Septims";
  document.getElementById("stat-benefice").innerText =
    (totalVentes - totalDepenses).toFixed(2) + " Septims";

  renderCharts(transactions);
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

// --- ACTIONS PATRON ---
async function approveUser(id) {
  await db.from("profiles").update({ is_approved: true }).eq("id", id);
  loadPatronData();
}

async function deleteTransaction(id) {
  if (
    confirm(
      "Supprimer cette transaction ? Attention, le stock ne sera pas recalculé automatiquement.",
    )
  ) {
    await db.from("transactions").delete().eq("id", id);
    loadPatronData();
    loadEmployeData();
  }
}

async function saveSalaries() {
  const updates = [];
  document.querySelectorAll('[id^="sal-name-"]').forEach((input) => {
    const id = input.id.replace("sal-name-", "");
    updates.push({
      id,
      name: input.value,
      salary:
        parseFloat(document.getElementById(`sal-amount-${id}`).value) || 0,
    });
  });
  await db.from("employees").upsert(updates);
  showPopup("Sauvegardé", "Contrats de salaires mis à jour.");
  loadPatronData();
}

async function paySalaries() {
  if (
    !confirm(
      "Confirmer le paiement de tous les salaires ? Cela va retirer l'argent de la trésorerie.",
    )
  )
    return;

  const { data: employees } = await db.from("employees").select("*");
  const toPay = employees.filter((e) => e.salary > 0);

  if (toPay.length === 0) return showPopup("Info", "Aucun salaire à payer.");

  let totalPaye = 0;
  const transactionsToInsert = toPay.map((e) => {
    totalPaye += e.salary;
    return {
      type: "salaire",
      item_type: "Salaire",
      counterparty_name: e.name,
      quantity: 1,
      unit_price: e.salary,
      created_by: currentUser.id,
    };
  });

  // Insérer toutes les transactions d'un coup
  const { error } = await db.from("transactions").insert(transactionsToInsert);

  if (error) {
    showPopup("Erreur", "Erreur lors du paiement : " + error.message);
  } else {
    showPopup(
      "Salaires Payés",
      `${totalPaye.toFixed(2)} Septims ont été distribués aux employés.`,
    );
    loadPatronData();
  }
}

db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    checkUserStatus();
  }
});
