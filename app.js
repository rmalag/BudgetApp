import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CONFIG_KEY = "budget-shared-config";
const CURRENCY = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const DATE_FMT = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
const LONG_DATE_FMT = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayIso = () => toIsoDate(new Date());

const state = {
  route: "home",
  selectedId: null,
  config: loadConfig(),
  connecting: false,
  firebaseReady: false,
  db: null,
  unsubscribers: [],
  accounts: [],
  categories: [],
  movements: [],
  range: {
    type: "day",
    anchor: startOfDay(new Date()),
    customStart: todayIso(),
    customEnd: todayIso()
  },
  editingSetup: null,
  selectedChartType: "income"
};

const view = document.querySelector("#view");
const title = document.querySelector("#screen-title");
const installButton = document.querySelector("#install-button");
let deferredInstallPrompt = null;

init();

function init() {
  bindNav();
  bindInstall();
  registerServiceWorker();

  if (state.config) {
    connectFirebase();
  }

  render();
}

function bindNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.dataset.route);
    });
  });
}

function bindInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

async function connectFirebase() {
  try {
    state.connecting = true;
    render();
    const appName = `budget-${state.config.workspaceId}`;
    const app = getApps().find((entry) => entry.name === appName) || initializeApp(state.config.firebaseConfig, appName);
    const auth = getAuth(app);
    await signInAnonymously(auth);
    state.db = getFirestore(app);
    state.firebaseReady = true;
    state.connecting = false;
    subscribeCollection("accounts", "name", (items) => {
      state.accounts = items;
      render();
    });
    subscribeCollection("categories", "name", (items) => {
      state.categories = items;
      render();
    });
    subscribeCollection("movements", "date", (items) => {
      state.movements = items.sort((a, b) => `${b.date || ""}${b.createdAt?.seconds || 0}`.localeCompare(`${a.date || ""}${a.createdAt?.seconds || 0}`));
      render();
    });
  } catch (error) {
    state.connecting = false;
    toast(`Configurazione Firebase non valida: ${error.message}`);
  }
}

function subscribeCollection(name, orderField, onItems) {
  const ref = collection(state.db, "workspaces", state.config.workspaceId, name);
  const unsubscribe = onSnapshot(
    query(ref, orderBy(orderField)),
    (snapshot) => onItems(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
    (error) => toast(`Errore realtime ${name}: ${error.message}`)
  );
  state.unsubscribers.push(unsubscribe);
}

function navigate(route, selectedId = null) {
  state.route = route;
  state.selectedId = selectedId;
  state.editingSetup = null;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route || (route.startsWith("movement") && button.dataset.route === "movement-new"));
  });
  render();
}

function render() {
  if (state.config && state.connecting) {
    setTitle("Connessione");
    view.innerHTML = `<section class="panel"><h2>Connessione realtime</h2><p class="muted">Sto collegando il workspace condiviso.</p></section>`;
    return;
  }

  if (!state.config || !state.firebaseReady) {
    setTitle("Setup iniziale");
    renderInitialSetup();
    return;
  }

  if (state.route === "setup") renderSetup();
  else if (state.route === "movement-new") renderMovementForm();
  else if (state.route === "movement-detail") renderMovementDetail();
  else if (state.route === "balances") renderBalancesPage();
  else renderHome();
}

function setTitle(text) {
  title.textContent = text;
}

function renderInitialSetup() {
  view.innerHTML = `
    <section class="panel">
      <h2>Connessione realtime</h2>
      <p class="muted">Inserisci la configurazione web di Firebase e un ID workspace condiviso. Tutti gli utenti con gli stessi dati vedranno le modifiche in tempo reale.</p>
      <form id="firebase-form" class="form">
        <label>Workspace condiviso
          <input name="workspaceId" required placeholder="famiglia-rossi" autocomplete="off" />
        </label>
        <label>Configurazione Firebase web
          <textarea name="firebaseConfig" required placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'></textarea>
        </label>
        <button class="primary-button" type="submit">Salva e connetti</button>
      </form>
    </section>
  `;

  document.querySelector("#firebase-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const firebaseConfig = JSON.parse(form.get("firebaseConfig"));
      state.config = {
        workspaceId: sanitizeWorkspaceId(form.get("workspaceId")),
        firebaseConfig
      };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
      connectFirebase();
    } catch (error) {
      toast(`JSON Firebase non valido: ${error.message}`);
    }
  });
}

function renderHome() {
  setTitle("Home");
  const { start, end, label } = getRange();
  const movements = state.movements.filter((movement) => movement.date >= toIsoDate(start) && movement.date <= toIsoDate(end));
  const income = movements.filter((movement) => movement.type === "income");
  const expense = movements.filter((movement) => movement.type === "expense");
  const chartType = state.selectedChartType;
  const chartData = chartType === "income" ? income : expense;
  const chartLabel = chartType === "income" ? "Entrate" : "Uscite";

  view.innerHTML = `
    <div class="toolbar">
      <div class="segmented" role="tablist" aria-label="Timespan">
        ${["day", "week", "month", "year"].map((type) => `<button class="range-button ${state.range.type === type ? "active" : ""}" type="button" data-range="${type}">${rangeName(type)}</button>`).join("")}
      </div>
      <button class="range-button ${state.range.type === "custom" ? "active" : ""}" type="button" data-range="custom">Custom</button>
      <div class="date-nav">
        <button class="icon-button" type="button" data-step="-1" aria-label="Periodo precedente" title="Periodo precedente">&lsaquo;</button>
        <div class="period-label">${label}</div>
        <button class="icon-button" type="button" data-step="1" aria-label="Periodo successivo" title="Periodo successivo">&rsaquo;</button>
      </div>
      ${state.range.type === "custom" ? `
        <form id="custom-range-form" class="custom-range">
          <label>Da <input type="date" name="start" value="${state.range.customStart}" /></label>
          <label>A <input type="date" name="end" value="${state.range.customEnd}" /></label>
          <button class="primary-button" type="submit">Applica</button>
        </form>
      ` : ""}
    </div>
    <section class="panel">
      <div class="chart-section">
        <div class="chart-header">
          <h2>${chartLabel}</h2>
          <div class="chart-toggle">
            <button class="chart-toggle-btn ${chartType === "income" ? "active" : ""}" type="button" data-chart-type="income">Entrate</button>
            <button class="chart-toggle-btn ${chartType === "expense" ? "active" : ""}" type="button" data-chart-type="expense">Uscite</button>
          </div>
        </div>
        ${chartSection("", "current-chart", chartData, chartType)}
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>Movimenti nel periodo</h2>
      ${movements.length ? movements.map(renderMovementRow).join("") : emptyStateHtml("Nessun movimento", "Aggiungi un movimento o cambia periodo.")}
    </section>
  `;

  bindHomeEvents();
  drawPie("current-chart", chartData, chartType);

}

// Pagina dedicata ai saldi conti
function renderBalancesPage() {
  setTitle("Saldi conti");
  view.innerHTML = `
    <section class="panel">
      <h2>Saldi conti</h2>
      ${renderBalances()}
      <div style="margin-top:24px">
        <button class="secondary-button" type="button" id="back-home">Torna alla home</button>
      </div>
    </section>
  `;
  document.querySelector("#back-home").addEventListener("click", () => navigate("home"));
}

function bindHomeEvents() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.range.type = button.dataset.range;
      if (state.range.type !== "custom") {
        state.range.anchor = startOfDay(new Date());
      }
      renderHome();
    });
  });

  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      moveRange(Number(button.dataset.step));
      renderHome();
    });
  });

  document.querySelector("#custom-range-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.range.customStart = form.get("start");
    state.range.customEnd = form.get("end");
    renderHome();
  });
  document.querySelectorAll("[data-chart-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedChartType = button.dataset.chartType;
      renderHome();
    });
  });
  document.querySelectorAll("[data-movement-id]").forEach((row) => {
    row.addEventListener("click", () => navigate("movement-detail", row.dataset.movementId));
  });
}

function chartSection(titleText, canvasId, movements, type) {
  return `
    <div class="chart-box">
      <h2>${titleText}</h2>
      <div class="chart-wrap"><canvas id="${canvasId}" width="320" height="320" aria-label="${titleText} per categoria"></canvas></div>
      <div class="legend">${legendHtml(movements, type)}</div>
    </div>
  `;
}

function legendHtml(movements, type) {
  const totals = totalsByCategory(movements);
  const rows = Object.entries(totals);
  if (!rows.length) return `<p class="muted">Nessun dato</p>`;
  return rows.map(([categoryId, total]) => {
    const category = findCategory(categoryId);
    return `
      <div class="legend-item">
        <div class="row-main">
          <span class="swatch" style="background:${category.color}"></span>
          <span>${escapeHtml(category.name)}</span>
        </div>
        <strong class="${type}">${CURRENCY.format(total)}</strong>
      </div>
    `;
  }).join("");
}

function drawPie(canvasId, movements, fallbackType) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const totals = Object.entries(totalsByCategory(movements));
  const total = totals.reduce((sum, [, value]) => sum + value, 0);

  if (!total) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 116, 0, Math.PI * 2);
    ctx.fillStyle = "#eee8dd";
    ctx.fill();
    ctx.fillStyle = "#687180";
    ctx.font = "700 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(CURRENCY.format(0), size / 2, size / 2 + 6);
    return;
  }

  let start = -Math.PI / 2;
  totals.forEach(([categoryId, value]) => {
    const slice = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.arc(size / 2, size / 2, 132, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = findCategory(categoryId).color || (fallbackType === "income" ? "#238b62" : "#c94843");
    ctx.fill();
    start += slice;
  });

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 72, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = "#18212f";
  ctx.font = "800 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText(CURRENCY.format(total), size / 2, size / 2 + 7);
}

function renderBalances() {
  if (!state.accounts.length) return emptyStateHtml("Nessun conto", "Crea almeno un conto dal setup.");
  return state.accounts.map((account) => {
    const balance = state.movements.reduce((sum, movement) => {
      if (movement.accountId !== account.id) return sum;
      return sum + (movement.type === "income" ? Number(movement.amount) : -Number(movement.amount));
    }, Number(account.initialBalance || 0));
    return `
      <div class="balance-row">
        <div class="row-main">
          <span class="swatch" style="background:${account.color}"></span>
          <strong>${escapeHtml(account.name)}</strong>
        </div>
        <span class="amount">${CURRENCY.format(balance)}</span>
      </div>
    `;
  }).join("");
}

function renderMovementRow(movement) {
  const category = findCategory(movement.categoryId);
  const account = findAccount(movement.accountId);
  const signClass = movement.type === "income" ? "income" : "expense";
  const sign = movement.type === "income" ? "+" : "-";
  return `
    <button class="movement-row" type="button" data-movement-id="${movement.id}">
      <div class="row-main">
        <span class="swatch" style="background:${category.color}"></span>
        <span class="row-copy">
          <strong>${movement.type === "income" ? "Entrata" : "Uscita"} &middot; ${escapeHtml(category.name)}</strong>
          <span class="muted">${formatIsoDate(movement.date)} &middot; ${escapeHtml(account.name)}${movement.note ? ` &middot; ${escapeHtml(movement.note)}` : ""}</span>
        </span>
      </div>
      <span class="amount ${signClass}">${sign}${CURRENCY.format(Number(movement.amount || 0))}</span>
    </button>
  `;
}

function renderMovementForm(existing = null) {
  const isEditing = Boolean(existing?.id);
  setTitle(isEditing ? "Modifica movimento" : "Nuovo movimento");
  const categories = state.categories.filter((category) => category.type === (existing?.type || "expense"));
  view.innerHTML = `
    <section class="panel">
      <form id="movement-form" class="form">
        <div class="form-grid">
          <label>Tipo
            <select name="type" required>
              <option value="expense" ${existing?.type === "expense" ? "selected" : ""}>Uscita</option>
              <option value="income" ${existing?.type === "income" ? "selected" : ""}>Entrata</option>
            </select>
          </label>
          <label>Importo
            <input name="amount" type="number" step="0.01" min="0.01" required value="${existing?.amount || ""}" />
          </label>
          <label>Data
            <input name="date" type="date" required value="${existing?.date || todayIso()}" />
          </label>
          <label>Conto
            <select name="accountId" required>${state.accounts.map((account) => `<option value="${account.id}" ${existing?.accountId === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}</select>
          </label>
          <label>Categoria
            <select name="categoryId" required>${categories.map((category) => `<option value="${category.id}" ${existing?.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select>
          </label>
        </div>
        <label>Note
          <textarea name="note">${existing?.note ? escapeHtml(existing.note) : ""}</textarea>
        </label>
        <div class="actions">
          <button class="primary-button" type="submit">${isEditing ? "Salva modifiche" : "Aggiungi movimento"}</button>
          ${isEditing ? `<button class="danger-button" type="button" id="delete-movement">Elimina</button>` : ""}
        </div>
      </form>
    </section>
  `;

  const form = document.querySelector("#movement-form");
  const typeSelect = form.querySelector('[name="type"]');
  typeSelect.addEventListener("change", () => renderMovementForm({ ...(existing || {}), type: typeSelect.value }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = movementPayload(new FormData(form));
    if (!state.accounts.length || !state.categories.some((category) => category.id === data.categoryId)) {
      toast("Crea prima almeno un conto e una categoria compatibile.");
      return;
    }
    if (isEditing) {
      await updateDoc(doc(collectionRef("movements"), existing.id), data);
      toast("Movimento aggiornato");
      navigate("movement-detail", existing.id);
    } else {
      const added = await addDoc(collectionRef("movements"), { ...data, createdAt: serverTimestamp() });
      toast("Movimento aggiunto");
      navigate("movement-detail", added.id);
    }
  });

  document.querySelector("#delete-movement")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questo movimento?")) return;
    await deleteDoc(doc(collectionRef("movements"), existing.id));
    state.movements = state.movements.filter((m) => m.id !== existing.id);
    render();
    toast("Movimento eliminato");
    navigate("home");
  });
}

function renderMovementDetail() {
  const movement = state.movements.find((item) => item.id === state.selectedId);
  if (!movement) {
    navigate("home");
    return;
  }
  setTitle("Dettaglio movimento");
  const category = findCategory(movement.categoryId);
  const account = findAccount(movement.accountId);
  view.innerHTML = `
    <section class="panel">
      <div class="setup-row">
        <div class="row-main">
          <span class="swatch" style="background:${category.color}"></span>
          <div class="row-copy">
            <strong>${movement.type === "income" ? "Entrata" : "Uscita"} &middot; ${escapeHtml(category.name)}</strong>
            <span class="muted">${formatIsoDate(movement.date)} &middot; ${escapeHtml(account.name)}</span>
          </div>
        </div>
        <span class="amount ${movement.type}">${movement.type === "income" ? "+" : "-"}${CURRENCY.format(Number(movement.amount))}</span>
      </div>
      ${movement.note ? `<p>${escapeHtml(movement.note)}</p>` : `<p class="muted">Nessuna nota</p>`}
      <div class="actions">
        <button class="primary-button" type="button" id="edit-movement">Modifica</button>
        <button class="secondary-button" type="button" id="back-home">Torna alla home</button>
      </div>
    </section>
  `;
  document.querySelector("#edit-movement").addEventListener("click", () => renderMovementForm(movement));
  document.querySelector("#back-home").addEventListener("click", () => navigate("home"));
}

function renderSetup() {
  setTitle("Setup");
  view.innerHTML = `
    <div class="grid">
      <section class="panel">
        <h2>Conti</h2>
        ${setupForm("account")}
        <div>${state.accounts.length ? state.accounts.map((item) => setupRow(item, "account")).join("") : emptyStateHtml("Nessun conto", "Aggiungi il primo conto.")}</div>
      </section>
      <section class="panel">
        <h2>Categorie</h2>
        ${setupForm("category")}
        <div>${state.categories.length ? state.categories.map((item) => setupRow(item, "category")).join("") : emptyStateHtml("Nessuna categoria", "Aggiungi entrate e uscite.")}</div>
      </section>
      <section class="panel">
        <h2>Workspace</h2>
        <p class="muted">ID condiviso: <strong>${escapeHtml(state.config.workspaceId)}</strong></p>
        <button class="danger-button" type="button" id="reset-config">Cambia connessione</button>
      </section>
    </div>
  `;
  bindSetupEvents();
}

function setupForm(kind) {
  const editing = state.editingSetup?.kind === kind ? state.editingSetup.item : null;
  const isCategory = kind === "category";
  return `
    <form class="form setup-form" data-kind="${kind}">
      <div class="form-grid">
        <label>Nome
          <input name="name" required value="${editing ? escapeHtml(editing.name) : ""}" />
        </label>
        <label>Colore
          <input name="color" type="color" required value="${editing?.color || (isCategory ? "#d95f59" : "#2fa49f")}" />
        </label>
        ${isCategory ? `
          <label>Tipo
            <select name="type" required>
              <option value="expense" ${editing?.type === "expense" ? "selected" : ""}>Uscita</option>
              <option value="income" ${editing?.type === "income" ? "selected" : ""}>Entrata</option>
            </select>
          </label>
        ` : `
          <label>Saldo iniziale
            <input name="initialBalance" type="number" step="0.01" value="${editing?.initialBalance || 0}" />
          </label>
        `}
      </div>
      <div class="actions">
        <button class="primary-button" type="submit">${editing ? "Salva" : "Aggiungi"}</button>
        ${editing ? `<button class="secondary-button" type="button" data-cancel-edit> Annulla</button>` : ""}
      </div>
    </form>
  `;
}

function setupRow(item, kind) {
  const used = isSetupItemUsed(item.id, kind);
  const subtitle = kind === "category" ? (item.type === "income" ? "Entrata" : "Uscita") : `Saldo iniziale ${CURRENCY.format(Number(item.initialBalance || 0))}`;
  return `
    <div class="setup-row">
      <div class="row-main">
        <span class="swatch" style="background:${item.color}"></span>
        <div class="row-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="muted">${subtitle}${used ? " &middot; usato in movimenti" : ""}</span>
        </div>
      </div>
      <div class="actions">
        <button class="secondary-button" type="button" data-edit-kind="${kind}" data-edit-id="${item.id}">Modifica</button>
        <button class="danger-button" type="button" data-delete-kind="${kind}" data-delete-id="${item.id}" ${used ? "disabled" : ""}>Elimina</button>
      </div>
    </div>
  `;
}

function bindSetupEvents() {
  document.querySelectorAll(".setup-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const kind = form.dataset.kind;
      const payload = setupPayload(kind, new FormData(form));
      const editing = state.editingSetup?.kind === kind ? state.editingSetup.item : null;
      if (editing) {
        await updateDoc(doc(collectionRef(collectionName(kind)), editing.id), payload);
        state.editingSetup = null;
        toast("Voce aggiornata");
      } else {
        await addDoc(collectionRef(collectionName(kind)), { ...payload, createdAt: serverTimestamp() });
        toast("Voce aggiunta");
      }
      renderSetup();
    });
  });

  document.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const items = button.dataset.editKind === "account" ? state.accounts : state.categories;
      state.editingSetup = { kind: button.dataset.editKind, item: items.find((item) => item.id === button.dataset.editId) };
      renderSetup();
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.deleteKind;
      const id = button.dataset.deleteId;
      if (isSetupItemUsed(id, kind)) {
        toast("Questa voce e gia stata usata e non puo essere eliminata.");
        return;
      }
      if (!confirm("Eliminare questa voce?")) return;
      await deleteDoc(doc(collectionRef(collectionName(kind)), id));
      toast("Voce eliminata");
    });
  });

  document.querySelectorAll("[data-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingSetup = null;
      renderSetup();
    });
  });

  document.querySelector("#reset-config").addEventListener("click", () => {
    if (!confirm("Cambiare connessione realtime su questo dispositivo? I dati remoti non verranno cancellati.")) return;
    state.unsubscribers.forEach((unsubscribe) => unsubscribe());
    state.unsubscribers = [];
    localStorage.removeItem(CONFIG_KEY);
    state.config = null;
    state.connecting = false;
    state.firebaseReady = false;
    render();
  });
}

function movementPayload(form) {
  return {
    type: form.get("type"),
    amount: Number(form.get("amount")),
    date: form.get("date"),
    accountId: form.get("accountId"),
    categoryId: form.get("categoryId"),
    note: String(form.get("note") || "").trim(),
    updatedAt: serverTimestamp()
  };
}

function setupPayload(kind, form) {
  if (kind === "category") {
    return {
      name: String(form.get("name")).trim(),
      color: form.get("color"),
      type: form.get("type"),
      updatedAt: serverTimestamp()
    };
  }
  return {
    name: String(form.get("name")).trim(),
    color: form.get("color"),
    initialBalance: Number(form.get("initialBalance") || 0),
    updatedAt: serverTimestamp()
  };
}

function collectionRef(name) {
  return collection(state.db, "workspaces", state.config.workspaceId, name);
}

function collectionName(kind) {
  return kind === "account" ? "accounts" : "categories";
}

function isSetupItemUsed(id, kind) {
  const field = kind === "account" ? "accountId" : "categoryId";
  return state.movements.some((movement) => movement[field] === id);
}

function totalsByCategory(movements) {
  return movements.reduce((acc, movement) => {
    acc[movement.categoryId] = (acc[movement.categoryId] || 0) + Number(movement.amount || 0);
    return acc;
  }, {});
}

function findCategory(id) {
  return state.categories.find((category) => category.id === id) || { name: "Categoria rimossa", color: "#687180" };
}

function findAccount(id) {
  return state.accounts.find((account) => account.id === id) || { name: "Conto rimosso", color: "#687180" };
}

function getRange() {
  if (state.range.type === "custom") {
    const start = parseIsoDate(state.range.customStart);
    const end = parseIsoDate(state.range.customEnd);
    return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
  }

  const anchor = state.range.anchor;
  if (state.range.type === "day") {
    return { start: startOfDay(anchor), end: startOfDay(anchor), label: formatDate(anchor) };
  }
  if (state.range.type === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
  }
  if (state.range.type === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start, end, label: new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(anchor) };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear(), 11, 31);
  return { start, end, label: String(anchor.getFullYear()) };
}

function moveRange(step) {
  if (state.range.type === "custom") {
    const start = parseIsoDate(state.range.customStart);
    const end = parseIsoDate(state.range.customEnd);
    const length = daysBetween(start, end) + 1;
    state.range.customStart = toIsoDate(addDays(start, step * length));
    state.range.customEnd = toIsoDate(addDays(end, step * length));
    return;
  }
  const anchor = new Date(state.range.anchor);
  if (state.range.type === "day") state.range.anchor = addDays(anchor, step);
  if (state.range.type === "week") state.range.anchor = addDays(anchor, step * 7);
  if (state.range.type === "month") state.range.anchor = new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
  if (state.range.type === "year") state.range.anchor = new Date(anchor.getFullYear() + step, 0, 1);
}

function rangeName(type) {
  return { day: "Giorno", week: "Settimana", month: "Mese", year: "Anno" }[type];
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const day = date.getDay() || 7;
  return addDays(startOfDay(date), 1 - day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.round((startOfDay(end) - startOfDay(start)) / 86400000);
}

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return DATE_FMT.format(date);
}

function formatIsoDate(value) {
  return LONG_DATE_FMT.format(parseIsoDate(value));
}

function emptyStateHtml(heading, copy) {
  return `<section class="empty-state"><h2>${heading}</h2><p>${copy}</p></section>`;
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeWorkspaceId(value) {
  const id = String(value).trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  if (!id) throw new Error("Workspace non valido");
  return id;
}

function loadConfig() {
  try {
    // Check if config is provided via environment (from window.FIREBASE_CONFIG set by server)
    if (window.FIREBASE_CONFIG) {
      return {
        workspaceId: window.FIREBASE_CONFIG.workspaceId,
        firebaseConfig: {
          apiKey: window.FIREBASE_CONFIG.apiKey,
          authDomain: window.FIREBASE_CONFIG.authDomain,
          projectId: window.FIREBASE_CONFIG.projectId,
          storageBucket: window.FIREBASE_CONFIG.storageBucket,
          messagingSenderId: window.FIREBASE_CONFIG.messagingSenderId,
          appId: window.FIREBASE_CONFIG.appId,
          measurementId: window.FIREBASE_CONFIG.measurementId
        }
      };
    }
    // Fall back to localStorage (current behavior for backward compatibility)
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
