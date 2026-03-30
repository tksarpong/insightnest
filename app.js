// ─── CONFIG ───────────────────────────────────────────────────────────────────
// REPLACE THIS with your Google OAuth Client ID from Google Cloud Console
const CLIENT_ID = '49730658545-7j8i7j8uqbfl6hdr05css2h8tg58gdfc.apps.googleusercontent.com';

// Scopes needed: read and write Google Sheets
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Sheet tab names — must match exactly what you name them in Google Sheets
const SHEET_SALES     = 'Sales';
const SHEET_EXPENSES  = 'Expenses';

// ─── STATE ────────────────────────────────────────────────────────────────────
let tokenClient;
let accessToken = null;
let sheetId = localStorage.getItem('insightnest_sheet_id') || '';
let products = JSON.parse(localStorage.getItem('insightnest_products') || '[]');
let categories = JSON.parse(localStorage.getItem('insightnest_categories') || '["Rent / Office","Utilities - Water","Utilities - Electricity","Salaries / Wages","Marketing","Stationery/Printing","Transport / Delivery","Internet / Airtime","Equipment Maintenance","Bank Charges","Stock Purchase - Laptops & Desktops","Stock Purchase - Accessories","Stock Purchase - Printers & Ink","Stock Purchase - Networking","Stock Purchase - Storage & UPS","Stock Purchase - Other"]');
let currentSection = 'dashboard';
let currentTab = 'sale';
let gapiReady = false;
let gisReady = false;

// ─── THEME ────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('insightnest_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  const html = document.documentElement;
  html.className = theme;
  localStorage.setItem('insightnest_theme', theme);
  const isDark = theme === 'dark';
  const moonIcon = document.getElementById('icon-moon');
  const sunIcon  = document.getElementById('icon-sun');
  const label    = document.getElementById('theme-label');
  const pill     = document.getElementById('theme-pill');
  const metaTheme = document.getElementById('theme-color-meta');
  if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
  if (sunIcon)  sunIcon.style.display  = isDark ? 'none'  : 'block';
  if (label)    label.textContent = isDark ? 'Dark mode' : 'Light mode';
  if (pill)     pill.classList.toggle('on', !isDark);
  if (metaTheme) metaTheme.content = isDark ? '#0a1210' : '#f4f7f0';
}

function toggleTheme() {
  const current = localStorage.getItem('insightnest_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}


function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({ discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
    gapiReady = true;
    maybeInit();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error) { showToast('Sign-in failed: ' + resp.error); return; }
      accessToken = resp.access_token;
      gapi.client.setToken({ access_token: accessToken });
      onSignedIn();
    }
  });
  gisReady = true;
  maybeInit();
}

function clearAuthStorage() {
  localStorage.removeItem('insightnest_token');
  localStorage.removeItem('insightnest_token_expiry');
  localStorage.removeItem('insightnest_user');
}

function maybeInit() {
  if (!gapiReady || !gisReady) return;
  const saved = localStorage.getItem('insightnest_token');
  const expiry = parseInt(localStorage.getItem('insightnest_token_expiry') || '0');
  const now = Date.now();
  if (saved && expiry > now) {
    accessToken = saved;
    gapi.client.setToken({ access_token: accessToken });
    // Restore cached user info instantly so UI appears immediately
    const cachedUser = localStorage.getItem('insightnest_user');
    if (cachedUser) {
      try { setUserUI(JSON.parse(cachedUser)); } catch(e) {}
    }
    // Validate token is still accepted by Google
    fetchUserInfo().then(info => {
      if (info) {
        localStorage.setItem('insightnest_user', JSON.stringify(info));
        onSignedIn(info);
      } else {
        clearAuthStorage();
        showLogin();
      }
    }).catch(() => { clearAuthStorage(); showLogin(); });
  } else {
    clearAuthStorage();
    showLogin();
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function handleSignIn() {
  if (!gapiReady || !gisReady) { showToast('Still loading, please wait...'); return; }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignOut() {
  google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  clearAuthStorage();
  gapi.client.setToken(null);
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

async function onSignedIn(userInfo) {
  // Store token with 50-minute expiry (Google tokens last ~60 min)
  localStorage.setItem('insightnest_token', accessToken);
  localStorage.setItem('insightnest_token_expiry', String(Date.now() + 50 * 60 * 1000));
  const info = userInfo || await fetchUserInfo();
  if (info) setUserUI(info);

  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  // Show setup banner if no sheet ID
  if (!sheetId) {
    document.getElementById('setup-banner').classList.remove('hidden');
  }

  populateSelects();
  populateSettingsFields();
  loadDashboard();
  autoPopulateFromSheet();
}

async function fetchUserInfo() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function setUserUI(info) {
  const name = info.name || info.email || '';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pic = info.picture || '';

  ['user-avatar', 'user-avatar-lg'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (pic) { el.innerHTML = `<img src="${pic}" alt="${name}">`; }
    else { el.textContent = initials; }
    el.title = name;
  });

  const nameEl = document.getElementById('user-name-settings');
  const emailEl = document.getElementById('user-email-settings');
  if (nameEl) nameEl.textContent = info.name || '';
  if (emailEl) emailEl.textContent = info.email || '';
}

// ─── GOOGLE SHEETS API ────────────────────────────────────────────────────────
async function sheetsGet(range) {
  if (!sheetId) throw new Error('No Sheet ID configured');
  const r = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  return r.result.values || [];
}

async function sheetsAppend(sheetName, row) {
  if (!sheetId) throw new Error('No Sheet ID configured');
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [row] }
  });
}

async function ensureHeaders() {
  if (!sheetId) return;
  try {
    const salesRows = await sheetsGet(`${SHEET_SALES}!A1:H1`);
    if (!salesRows.length || !salesRows[0][0]) {
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: `${SHEET_SALES}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [['DATE','CUSTOMER','PRODUCT/ITEM','UNIT PRICE','QUANTITY','DISCOUNT','TOTAL','PAYMENT STATUS']] }
      });
    }
    const expRows = await sheetsGet(`${SHEET_EXPENSES}!A1:F1`);
    if (!expRows.length || !expRows[0][0]) {
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: `${SHEET_EXPENSES}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [['DATE','METHOD OF PAYMENT','DESCRIPTION','CATEGORY','AMOUNT PAID','PAYMENT STATUS']] }
      });
    }
  } catch(e) { console.warn('Header check failed:', e); }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!sheetId) { showDashContent(); return; }
  document.getElementById('loading-dash').classList.remove('hidden');
  document.getElementById('dash-content').classList.add('hidden');
  try {
    await ensureHeaders();
    const [salesRows, expRows] = await Promise.all([
      sheetsGet(`${SHEET_SALES}!A2:H5000`),
      sheetsGet(`${SHEET_EXPENSES}!A2:F5000`)
    ]);
    // Debug: log first 3 date values to console so we can see the format
    if (salesRows.length > 0) {
      const sample = salesRows.slice(0,3).map(r => r[0]);
      console.log('Sales date samples from Sheet:', sample);
    }
    computeDashboard(salesRows, expRows);
  } catch(e) {
    showToast('Could not load data. Check your Sheet ID.');
    computeDashboard([], []);
  }
}

function computeDashboard(salesRows, expRows) {
  const allSales = salesRows.filter(r => r && r[0]);
  const allExps  = expRows.filter(r => r && r[0]);
  const sales = filterByPeriod(allSales, 0, currentPeriod);
  const exps  = filterByPeriod(allExps,  0, currentPeriod);

  const totalRev  = sales.reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);
  const totalExp  = exps.reduce((a, r) => a + (parseFloat(r[4]) || 0), 0);
  const net       = totalRev - totalExp;
  const received  = sales.filter(r => r[7] === 'Paid').reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);
  const unpaidAmt = sales.filter(r => r[7] !== 'Paid').reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);

  setKPI('kpi-revenue',  fmt(totalRev));
  setKPI('kpi-expenses', fmt(totalExp));
  setKPI('kpi-profit',   fmt(net));
  setKPI('kpi-received', fmt(received));
  setKPI('kpi-orders',   sales.length);
  setKPI('kpi-unpaid',   fmt(unpaidAmt));
  setKPI('kpi-exp-count', exps.length);

  // Charts
  const byCustomer = {};
  const byProduct  = {};
  const byCategory = {};
  sales.forEach(r => {
    const c = r[1] || 'Unknown', p = r[2] || 'Unknown', v = parseFloat(r[6]) || 0;
    byCustomer[c] = (byCustomer[c] || 0) + v;
    byProduct[p]  = (byProduct[p]  || 0) + v;
  });
  exps.forEach(r => {
    const cat = r[3] || 'Other', v = parseFloat(r[4]) || 0;
    byCategory[cat] = (byCategory[cat] || 0) + v;
  });

  renderBarChart('chart-customer', byCustomer);
  renderBarChart('chart-product',  byProduct);
  renderBarChart('chart-category', byCategory);
  renderExpensePie(exps, 'expense-pie-wrap');

  showDashContent();
}

function showDashContent() {
  document.getElementById('loading-dash').classList.add('hidden');
  document.getElementById('dash-content').classList.remove('hidden');
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderBarChart(containerId, data) {
  const el = document.getElementById(containerId);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = entries[0] ? entries[0][1] : 1;
  if (!entries.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:1rem">No data yet</p>'; return; }
  el.innerHTML = entries.map(([name, val]) => `
    <div class="bar-row">
      <div class="bar-name" title="${name}">${name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(val/max*100)}%"></div></div>
      <div class="bar-val">${fmt(val)}</div>
    </div>`).join('');
}

// ─── SALES ────────────────────────────────────────────────────────────────────
async function loadSales() {
  document.getElementById('loading-sales').classList.remove('hidden');
  document.getElementById('sales-list').classList.add('hidden');
  document.getElementById('sales-empty').classList.add('hidden');
  if (!sheetId) { showEmptyOrList('sales', []); return; }
  try {
    const rows = await sheetsGet(`${SHEET_SALES}!A2:H5000`);
    const sales = rows.filter(r => r && r[0]);
    showEmptyOrList('sales', sales.reverse());
  } catch(e) {
    showToast('Could not load sales.');
    showEmptyOrList('sales', []);
  }
}

function showEmptyOrList(type, rows) {
  document.getElementById(`loading-${type}`).classList.add('hidden');
  if (!rows.length) {
    document.getElementById(`${type}-empty`).classList.remove('hidden');
    return;
  }
  const list = document.getElementById(`${type}-list`);
  list.classList.remove('hidden');
  if (type === 'sales') {
    list.innerHTML = rows.map(r => `
      <div class="record-card">
        <div class="record-top">
          <div>
            <div class="record-name">${esc(r[1] || '—')}</div>
            <div class="record-sub">${esc(r[2] || '—')}</div>
          </div>
          <div style="text-align:right">
            <div class="record-amount">${fmt(parseFloat(r[6]) || 0)}</div>
            <span class="badge badge-${(r[7]||'').toLowerCase()}">${esc(r[7] || '—')}</span>
          </div>
        </div>
        <div class="record-meta">
          <span class="record-date">${esc(r[0] ? r[0].slice(0,10) : '—')}</span>
          <span class="record-sub">Qty: ${esc(r[4] || '0')} · ₵${esc(r[3] || '0')} each</span>
        </div>
      </div>`).join('');
  } else {
    list.innerHTML = rows.map(r => `
      <div class="record-card">
        <div class="record-top">
          <div>
            <div class="record-name">${esc(r[2] || '—')}</div>
            <div class="record-sub">${esc(r[3] || '—')}</div>
          </div>
          <div style="text-align:right">
            <div class="record-amount">${fmt(parseFloat(r[4]) || 0)}</div>
            <span class="badge badge-${(r[5]||'').toLowerCase()}">${esc(r[5] || '—')}</span>
          </div>
        </div>
        <div class="record-meta">
          <span class="record-date">${esc(r[0] ? r[0].slice(0,10) : '—')}</span>
          <span class="record-sub">${esc(r[1] || '—')}</span>
        </div>
      </div>`).join('');
  }
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
async function loadExpenses() {
  document.getElementById('loading-expenses').classList.remove('hidden');
  document.getElementById('expenses-list').classList.add('hidden');
  document.getElementById('expenses-empty').classList.add('hidden');
  if (!sheetId) { showEmptyOrList('expenses', []); return; }
  try {
    const rows = await sheetsGet(`${SHEET_EXPENSES}!A2:F5000`);
    const exps = rows.filter(r => r && r[0]);
    showEmptyOrList('expenses', exps.reverse());
  } catch(e) {
    showToast('Could not load expenses.');
    showEmptyOrList('expenses', []);
  }
}

// ─── SUBMIT SALE ──────────────────────────────────────────────────────────────
async function submitSale() {
  const date     = document.getElementById('f-date').value;
  const customer = document.getElementById('f-customer').value.trim();
  const product  = document.getElementById('f-product').value;
  const price    = parseFloat(document.getElementById('f-price').value) || 0;
  const qty      = parseInt(document.getElementById('f-qty').value) || 0;
  const discount = parseFloat(document.getElementById('f-discount').value) || 0;
  const status   = document.querySelector('input[name="s-status"]:checked')?.value || 'Paid';

  if (!date || !customer || !price || !qty) { showFormMsg('sale-msg', 'Please fill in all required fields.', 'error'); return; }

  const total = (price * qty) - discount;
  const btn = document.getElementById('btn-sale-submit');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    await sheetsAppend(SHEET_SALES, [date, customer, product, price, qty, discount, total.toFixed(2), status]);
    showFormMsg('sale-msg', 'Sale recorded successfully!', 'success');
    showToast('Sale saved to Google Sheets');
    document.getElementById('f-customer').value = '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-qty').value = '';
    document.getElementById('f-discount').value = '0';
    calcTotal();
    if (currentSection === 'dashboard') loadDashboard();
    if (currentSection === 'sales') loadSales();
  } catch(e) {
    showFormMsg('sale-msg', 'Failed to save. Check your Sheet ID and permissions.', 'error');
  }
  btn.disabled = false; btn.textContent = 'Record Sale';
}

// ─── SUBMIT EXPENSE ───────────────────────────────────────────────────────────
async function submitExpense() {
  const date   = document.getElementById('e-date').value;
  const desc   = document.getElementById('e-desc').value.trim();
  const cat    = document.getElementById('e-cat').value;
  const amount = parseFloat(document.getElementById('e-amount').value) || 0;
  const method = document.getElementById('e-method').value;
  const status = document.querySelector('input[name="e-status"]:checked')?.value || 'Paid';

  if (!date || !amount) { showFormMsg('exp-msg', 'Please fill in date and amount.', 'error'); return; }

  const btn = document.getElementById('btn-exp-submit');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    await sheetsAppend(SHEET_EXPENSES, [date, method, desc, cat, amount.toFixed(2), status]);
    showFormMsg('exp-msg', 'Expense recorded successfully!', 'success');
    showToast('Expense saved to Google Sheets');
    document.getElementById('e-desc').value = '';
    document.getElementById('e-amount').value = '';
    if (currentSection === 'dashboard') loadDashboard();
    if (currentSection === 'expenses') loadExpenses();
  } catch(e) {
    showFormMsg('exp-msg', 'Failed to save. Check your Sheet ID and permissions.', 'error');
  }
  btn.disabled = false; btn.textContent = 'Record Expense';
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

// ─── AUTO-POPULATE SETTINGS FROM SHEET DATA ───────────────────────────────────
async function autoPopulateFromSheet() {
  if (!sheetId) return;

  // Only auto-populate if still using defaults
  const isDefaultProducts = products.length === 0;

  const defaultCategories = ['Rent / Office','Utilities - Water',
    'Utilities - Electricity','Salaries / Wages','Marketing','Stationery/Printing'];
  const isDefaultCategories = categories.length <= 6 &&
    categories.every(c => defaultCategories.includes(c));

  // If both already customised, skip
  if (!isDefaultProducts && !isDefaultCategories) return;

  try {
    const [salesRows, expRows] = await Promise.all([
      sheetsGet(`${SHEET_SALES}!A2:H5000`),
      sheetsGet(`${SHEET_EXPENSES}!A2:F5000`)
    ]);

    let changed = false;

    // Extract unique products from Sales column C (index 2)
    if (isDefaultProducts) {
      const uniqueProducts = [...new Set(
        salesRows
          .filter(r => r && r[2] && String(r[2]).trim())
          .map(r => String(r[2]).trim())
      )].sort();

      if (uniqueProducts.length > 0) {
        products = uniqueProducts;
        localStorage.setItem('insightnest_products', JSON.stringify(products));
        changed = true;
        console.log(`Auto-populated ${products.length} products from Sheet`);
      }
    }

    // Extract unique categories from Expenses column D (index 3)
    if (isDefaultCategories) {
      const uniqueCategories = [...new Set(
        expRows
          .filter(r => r && r[3] && String(r[3]).trim())
          .map(r => String(r[3]).trim())
      )].sort();

      if (uniqueCategories.length > 0) {
        categories = uniqueCategories;
        localStorage.setItem('insightnest_categories', JSON.stringify(categories));
        changed = true;
        console.log(`Auto-populated ${categories.length} categories from Sheet`);
      }
    }

    if (changed) {
      populateSelects();
      populateSettingsFields();
      showToast('Products & categories loaded from your Sheet ✓');
    }

  } catch(e) {
    console.warn('Auto-populate failed:', e);
  }
}

function saveSheetId() {
  const input = document.getElementById('sheet-id-input') || document.getElementById('sheet-id-settings');
  const val = input ? input.value.trim() : '';
  if (!val) { showToast('Please enter a Sheet ID'); return; }
  // Handle full URL pasted in
  const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  sheetId = match ? match[1] : val;
  localStorage.setItem('insightnest_sheet_id', sheetId);
  document.getElementById('setup-banner').classList.add('hidden');
  populateSettingsFields();
  showToast('Sheet connected');
  ensureHeaders();
  loadDashboard();
  autoPopulateFromSheet();
}

function saveProducts() {
  const raw = document.getElementById('products-input').value;
  products = raw.split('\n').map(p => p.trim()).filter(Boolean);
  localStorage.setItem('insightnest_products', JSON.stringify(products));
  populateSelects();
  showToast('Products saved');
}

function saveCategories() {
  const raw = document.getElementById('categories-input').value;
  categories = raw.split('\n').map(c => c.trim()).filter(Boolean);
  localStorage.setItem('insightnest_categories', JSON.stringify(categories));
  populateSelects();
  showToast('Categories saved');
}

function populateSelects() {
  const ps = document.getElementById('f-product');
  if (ps) ps.innerHTML = products.map(p => `<option>${esc(p)}</option>`).join('');
  const cs = document.getElementById('e-cat');
  if (cs) cs.innerHTML = categories.map(c => `<option>${esc(c)}</option>`).join('');
}

function populateSettingsFields() {
  const sid = document.getElementById('sheet-id-settings');
  if (sid) sid.value = sheetId;
  const pi = document.getElementById('products-input');
  if (pi) pi.value = products.join('\n');
  const ci = document.getElementById('categories-input');
  if (ci) ci.value = categories.join('\n');
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  const fab = document.getElementById('fab-btn');
  fab.style.display = (name === 'settings' || name === 'analytics' || name === 'rankings') ? 'none' : 'flex';

  if (name === 'dashboard') loadDashboard();
  if (name === 'sales') loadSales();
  if (name === 'expenses') loadExpenses();
  if (name === 'analytics') loadAnalytics();
  if (name === 'rankings') loadRankings();
  if (name === 'settings') populateSettingsFields();
}

function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setDefaultDate();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  hideFormMsgs();
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('form-sale').classList.toggle('active', tab === 'sale');
  document.getElementById('form-expense').classList.toggle('active', tab === 'expense');
  document.getElementById('tab-sale').classList.toggle('active', tab === 'sale');
  document.getElementById('tab-expense').classList.toggle('active', tab === 'expense');
  hideFormMsgs();
}

function setDefaultDate() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('f-date').value = today;
  document.getElementById('e-date').value = today;
}

function calcTotal() {
  const price    = parseFloat(document.getElementById('f-price')?.value) || 0;
  const qty      = parseInt(document.getElementById('f-qty')?.value) || 0;
  const discount = parseFloat(document.getElementById('f-discount')?.value) || 0;
  const total    = (price * qty) - discount;
  const el = document.getElementById('total-preview');
  if (el) el.textContent = 'Total: ' + fmt(Math.max(0, total));
}

function showFormMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-msg ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function hideFormMsgs() {
  ['sale-msg', 'exp-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

function fmt(n) {
  return '₵' + Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── GIS CALLBACK (called by Google's script tag) ─────────────────────────────
window.addEventListener('load', () => {
  initTheme();
  const interval = setInterval(() => {
    if (typeof google !== 'undefined' && google.accounts) {
      clearInterval(interval);
      gisLoaded();
    }
  }, 100);
});

// Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  document.getElementById('loading-analytics').classList.remove('hidden');
  document.getElementById('analytics-content').classList.add('hidden');
  if (!sheetId) { showAnalyticsContent([], []); return; }
  try {
    const [salesRows, expRows] = await Promise.all([
      sheetsGet(`${SHEET_SALES}!A2:H5000`),
      sheetsGet(`${SHEET_EXPENSES}!A2:F5000`)
    ]);
    showAnalyticsContent(
      salesRows.filter(r => r && r[0]),
      expRows.filter(r => r && r[0])
    );
  } catch(e) {
    showToast('Could not load analytics data.');
    showAnalyticsContent([], []);
  }
}

function showAnalyticsContent(allSales, allExps) {
  document.getElementById('loading-analytics').classList.add('hidden');
  document.getElementById('analytics-content').classList.remove('hidden');

  const sales = filterByPeriod(allSales, 0, currentAnalyticsPeriod);
  const exps  = filterByPeriod(allExps,  0, currentAnalyticsPeriod);

  renderGrowthRow(sales);
  renderInsights(sales, exps);
  renderExpensePie(exps, 'analytics-pie-wrap');
  renderMonthlyChart(sales, exps);
  renderProductPerformance(sales);
  renderCustomerRanking(sales);
  renderUnpaidFollowups(sales);
}

// ── Growth Row ─────────────────────────────────────────────────────────────
function renderGrowthRow(sales) {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisMonth = sales.filter(r => new Date(r[0]) >= thisMonthStart)
    .reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);
  const lastMonth = sales.filter(r => {
    const d = new Date(r[0]);
    return d >= lastMonthStart && d < thisMonthStart;
  }).reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);

  const growth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth * 100) : null;
  const isUp = growth !== null && growth >= 0;
  const arrow = growth === null ? '—' : (isUp ? '▲' : '▼');
  const pct   = growth === null ? 'No prior data' : Math.abs(growth).toFixed(1) + '% vs last month';
  const color = growth === null ? 'var(--text2)' : (isUp ? 'var(--green)' : 'var(--red)');

  const el = document.getElementById('growth-row');
  el.innerHTML = `
    <div class="growth-card">
      <div class="growth-label">This month revenue</div>
      <div class="growth-value">${fmt(thisMonth)}</div>
      <div class="growth-change" style="color:${color}">${arrow} ${pct}</div>
    </div>
    <div class="growth-card">
      <div class="growth-label">Last month revenue</div>
      <div class="growth-value">${fmt(lastMonth)}</div>
      <div class="growth-change" style="color:var(--text3)">Previous period</div>
    </div>`;
}

// ── Business Insights ──────────────────────────────────────────────────────
function renderInsights(sales, exps) {
  const insights = [];
  const now = new Date();

  // Growth trend
  const months = {};
  sales.forEach(r => {
    const d = new Date(r[0]);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months[key] = (months[key] || 0) + (parseFloat(r[6]) || 0);
  });
  const monthKeys = Object.keys(months).sort();
  if (monthKeys.length >= 2) {
    const last = months[monthKeys[monthKeys.length-1]];
    const prev = months[monthKeys[monthKeys.length-2]];
    const g = ((last - prev) / prev * 100);
    if (g > 10) insights.push({ type: 'success', text: `Revenue grew ${g.toFixed(0)}% last month — strong momentum. Consider increasing stock of top sellers.` });
    else if (g < -10) insights.push({ type: 'warning', text: `Revenue dropped ${Math.abs(g).toFixed(0)}% last month. Review which products slowed down and check for unpaid invoices.` });
    else insights.push({ type: 'info', text: `Revenue is stable month-on-month (${g > 0 ? '+' : ''}${g.toFixed(0)}%). Look for opportunities to grow your top customer accounts.` });
  }

  // Unpaid invoices
  const unpaidSales = sales.filter(r => r[7] !== 'Paid');
  const unpaidAmt = unpaidSales.reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);
  if (unpaidAmt > 0) {
    const names = [...new Set(unpaidSales.map(r => r[1]))].slice(0, 3).join(', ');
    insights.push({ type: 'warning', text: `${fmt(unpaidAmt)} in unpaid invoices from ${unpaidSales.length} sale(s). Follow up with: ${names}.` });
  }

  // Product concentration risk
  const byProduct = {};
  sales.forEach(r => { byProduct[r[2]] = (byProduct[r[2]] || 0) + (parseFloat(r[6]) || 0); });
  const totalRev = Object.values(byProduct).reduce((a,b) => a+b, 0);
  const sorted = Object.entries(byProduct).sort((a,b) => b[1]-a[1]);
  if (sorted.length > 0 && totalRev > 0) {
    const topPct = (sorted[0][1] / totalRev * 100);
    if (topPct > 50) insights.push({ type: 'warning', text: `"${sorted[0][0]}" makes up ${topPct.toFixed(0)}% of revenue. High dependency — diversify product sales to reduce risk.` });
    if (sorted.length > 3) {
      const lowSellers = sorted.slice(-3).filter(([,v]) => v / totalRev < 0.03);
      if (lowSellers.length > 0) insights.push({ type: 'info', text: `Low sellers (under 3% of revenue): ${lowSellers.map(([k]) => k).join(', ')}. Consider reducing stock or discontinuing these.` });
    }
  }

  // Profit margin
  const totalExpAmt = exps.reduce((a, r) => a + (parseFloat(r[4]) || 0), 0);
  if (totalRev > 0) {
    const margin = ((totalRev - totalExpAmt) / totalRev * 100);
    if (margin < 20) insights.push({ type: 'warning', text: `Profit margin is ${margin.toFixed(0)}% — below the healthy 20% threshold. Review your largest expense categories.` });
    else insights.push({ type: 'success', text: `Profit margin is ${margin.toFixed(0)}% — healthy. Keep monitoring expenses as revenue grows.` });
  }

  const el = document.getElementById('insights-list');
  if (!insights.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:0.5rem 0">Add more data to generate insights.</p>'; return; }
  el.innerHTML = insights.map(i => `
    <div class="insight-item insight-${i.type}">
      <span class="insight-dot"></span>
      <span>${i.text}</span>
    </div>`).join('');
}

// ── Monthly Chart ──────────────────────────────────────────────────────────
function renderMonthlyChart(sales, exps) {
  const revByMonth = {}, expByMonth = {};
  sales.forEach(r => {
    const d = new Date(r[0]); if (isNaN(d)) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    revByMonth[k] = (revByMonth[k] || 0) + (parseFloat(r[6]) || 0);
  });
  exps.forEach(r => {
    const d = new Date(r[0]); if (isNaN(d)) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    expByMonth[k] = (expByMonth[k] || 0) + (parseFloat(r[4]) || 0);
  });

  const allKeys = [...new Set([...Object.keys(revByMonth), ...Object.keys(expByMonth)])].sort().slice(-12);
  const maxVal = Math.max(...allKeys.map(k => Math.max(revByMonth[k]||0, expByMonth[k]||0)), 1);
  const el = document.getElementById('monthly-chart');
  if (!allKeys.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:1rem">No data yet</p>'; return; }

  el.innerHTML = `
    <div class="monthly-legend">
      <span class="legend-dot" style="background:var(--accent2)"></span><span>Revenue</span>
      <span class="legend-dot" style="background:var(--red);margin-left:12px"></span><span>Expenses</span>
    </div>
    <div class="monthly-bars">
      ${allKeys.map(k => {
        const rev = revByMonth[k] || 0;
        const exp = expByMonth[k] || 0;
        const rPct = Math.round(rev / maxVal * 100);
        const ePct = Math.round(exp / maxVal * 100);
        const label = k.slice(5) + '/' + k.slice(2,4);
        return `<div class="month-col">
          <div class="month-bars-wrap">
            <div class="month-bar rev" style="height:${rPct}%" title="Rev: ${fmt(rev)}"></div>
            <div class="month-bar exp" style="height:${ePct}%" title="Exp: ${fmt(exp)}"></div>
          </div>
          <div class="month-label">${label}</div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── Product Performance ────────────────────────────────────────────────────
function renderProductPerformance(sales) {
  const byProduct = {};
  sales.forEach(r => {
    const p = r[2] || 'Unknown';
    if (!byProduct[p]) byProduct[p] = { rev: 0, qty: 0, count: 0 };
    byProduct[p].rev   += parseFloat(r[6]) || 0;
    byProduct[p].qty   += parseInt(r[4])   || 0;
    byProduct[p].count += 1;
  });
  const sorted = Object.entries(byProduct).sort((a,b) => b[1].rev - a[1].rev);
  const totalRev = sorted.reduce((a,[,v]) => a + v.rev, 0);
  const el = document.getElementById('product-performance');
  if (!sorted.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:0.5rem">No data</p>'; return; }
  el.innerHTML = `
    <table class="analytics-table">
      <thead><tr><th>Product</th><th>Revenue</th><th>Units</th><th>Share</th><th>Action</th></tr></thead>
      <tbody>${sorted.map(([name, d]) => {
        const share = totalRev > 0 ? (d.rev / totalRev * 100) : 0;
        const action = share < 2 ? '<span class="tag tag-red">Consider dropping</span>'
                     : share > 25 ? '<span class="tag tag-green">Top seller</span>'
                     : '<span class="tag tag-gray">Stable</span>';
        return `<tr>
          <td class="td-name">${esc(name)}</td>
          <td>${fmt(d.rev)}</td>
          <td>${d.qty.toLocaleString()}</td>
          <td>${share.toFixed(1)}%</td>
          <td>${action}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// ── Customer Ranking ───────────────────────────────────────────────────────
function renderCustomerRanking(sales) {
  const byCustomer = {};
  sales.forEach(r => {
    const c = r[1] || 'Unknown';
    if (!byCustomer[c]) byCustomer[c] = { rev: 0, paid: 0, unpaid: 0, count: 0 };
    const v = parseFloat(r[6]) || 0;
    byCustomer[c].rev += v;
    byCustomer[c].count += 1;
    if (r[7] === 'Paid') byCustomer[c].paid += v;
    else byCustomer[c].unpaid += v;
  });
  const sorted = Object.entries(byCustomer).sort((a,b) => b[1].rev - a[1].rev).slice(0, 10);
  const el = document.getElementById('customer-ranking');
  if (!sorted.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:0.5rem">No data</p>'; return; }
  el.innerHTML = `
    <table class="analytics-table">
      <thead><tr><th>#</th><th>Customer</th><th>Total</th><th>Unpaid</th><th>Orders</th></tr></thead>
      <tbody>${sorted.map(([name, d], i) => `<tr>
        <td style="color:var(--text3)">${i+1}</td>
        <td class="td-name">${esc(name)}</td>
        <td>${fmt(d.rev)}</td>
        <td style="color:${d.unpaid > 0 ? 'var(--red)' : 'var(--text3)'}">${d.unpaid > 0 ? fmt(d.unpaid) : '—'}</td>
        <td>${d.count}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

// ── Unpaid Follow-ups ──────────────────────────────────────────────────────
function renderUnpaidFollowups(sales) {
  const unpaid = sales.filter(r => r[7] !== 'Paid').sort((a,b) => new Date(a[0]) - new Date(b[0]));
  const el = document.getElementById('unpaid-list-analytics');
  if (!unpaid.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--green);padding:0.5rem 0">✓ No unpaid invoices</p>';
    return;
  }
  el.innerHTML = `
    <table class="analytics-table">
      <thead><tr><th>Date</th><th>Customer</th><th>Product</th><th>Amount</th><th>Days old</th></tr></thead>
      <tbody>${unpaid.slice(0, 20).map(r => {
        const days = Math.floor((new Date() - new Date(r[0])) / 86400000);
        const urgency = days > 30 ? 'color:var(--red)' : days > 14 ? 'color:var(--amber)' : 'color:var(--text2)';
        return `<tr>
          <td>${r[0] ? r[0].slice(0,10) : '—'}</td>
          <td class="td-name">${esc(r[1]||'—')}</td>
          <td class="td-name">${esc(r[2]||'—')}</td>
          <td>${fmt(parseFloat(r[6])||0)}</td>
          <td style="${urgency}">${days}d</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// ─── PERIOD FILTER (Dashboard) ────────────────────────────────────────────────
let currentPeriod = 'all';
let currentAnalyticsPeriod = 'all';

function togglePeriodMenu() {
  document.getElementById('period-menu')?.classList.toggle('hidden');
}

function toggleAnalyticsPeriodMenu() {
  document.getElementById('analytics-period-menu')?.classList.toggle('hidden');
}

function setPeriod(period, label) {
  currentPeriod = period;
  const btn = document.getElementById('dash-period');
  if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  document.getElementById('period-menu')?.classList.add('hidden');
  loadDashboard();
}

function setAnalyticsPeriod(period, label) {
  currentAnalyticsPeriod = period;
  const btn = document.getElementById('analytics-period');
  if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  document.getElementById('analytics-period-menu')?.classList.add('hidden');
  loadAnalytics();
}

// Robust date parser — handles YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, "1 Mar 2024" etc.
function parseDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  // UNFORMATTED_VALUE returns dates as serial numbers (Google Sheets epoch: Dec 30 1899)
  const num = parseFloat(val);
  if (!isNaN(num) && num > 1 && num < 200000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(num) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  const s = String(val).trim();
  if (!s) return null;
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // M/D/YYYY
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (sl) {
    const [,a,b,y] = sl;
    if (+a > 12) return new Date(+y, +b-1, +a);
    return new Date(+y, +a-1, +b);
  }
  const d = new Date(s);
  if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return null;
}

// Debug helper — call once to log what your Sheet actually sends
function debugDateFormats(salesRows) {
  if (!salesRows || !salesRows.length) return;
  const sample = salesRows.slice(0,3).map(r => ({
    raw: r[0],
    parsed: parseDate(r[0])?.toISOString()?.slice(0,10) || 'FAILED'
  }));
  console.log('Date format debug:', JSON.stringify(sample));
  showToast('Date debug in console (F12)');
}

function getDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Custom range: period is object {from, to}
  if (typeof period === 'object' && period.from) return period;
  switch(period) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + 86400000) };
    case 'week': {
      const mon = new Date(today);
      mon.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
      return { from: mon, to: new Date() };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: end };
    }
    case '3months':
      return { from: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), to: new Date() };
    case '6months':
      return { from: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()), to: new Date() };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date() };
    default:
      return null;
  }
}

function filterByPeriod(rows, dateColIndex, period) {
  const p = period || 'all';
  if (p === 'all') return rows;
  const range = getDateRange(p);
  if (!range) return rows;
  return rows.filter(r => {
    if (!r || !r[dateColIndex]) return false;
    const d = parseDate(r[dateColIndex]);
    if (!d) return false;
    // Set to start of day for comparison
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dayStart >= range.from && dayStart < range.to;
  });
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  ['period-menu', 'analytics-period-menu'].forEach(id => {
    const menu = document.getElementById(id);
    const btnId = id === 'period-menu' ? 'dash-period' : 'analytics-period';
    const btn = document.getElementById(btnId);
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
});

// ─── CUSTOM DATE RANGE ────────────────────────────────────────────────────────
function openCustomRange(target) {
  document.getElementById('period-menu')?.classList.add('hidden');
  document.getElementById('analytics-period-menu')?.classList.add('hidden');
  document.getElementById('custom-range-target').value = target;
  // Default: current month
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const today = now.toISOString().slice(0,10);
  document.getElementById('custom-from').value = firstDay;
  document.getElementById('custom-to').value = today;
  document.getElementById('custom-range-overlay').classList.remove('hidden');
}

function closeCustomRange(e) {
  if (e.target === document.getElementById('custom-range-overlay')) {
    document.getElementById('custom-range-overlay').classList.add('hidden');
  }
}

function applyCustomRange() {
  const from = document.getElementById('custom-from').value;
  const to   = document.getElementById('custom-to').value;
  const target = document.getElementById('custom-range-target').value;
  if (!from || !to) { showToast('Please select both dates'); return; }
  if (from > to) { showToast('Start date must be before end date'); return; }

  // Build range object — add 1 day to "to" so it's inclusive
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  toDate.setDate(toDate.getDate() + 1);
  const range = { from: fromDate, to: toDate };

  const label = `${from.slice(5)} → ${to.slice(5)}`;

  document.getElementById('custom-range-overlay').classList.add('hidden');

  if (target === 'dashboard') {
    currentPeriod = range;
    const btn = document.getElementById('dash-period');
    if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
    loadDashboard();
  } else if (target === 'rankings') {
    rankPeriod = range;
    const btn = document.getElementById('rank-period-btn');
    if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
    renderRankings();
  } else {
    currentAnalyticsPeriod = range;
    const btn = document.getElementById('analytics-period');
    if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
    loadAnalytics();
  }
}

// ─── RANKINGS ─────────────────────────────────────────────────────────────────
let rankType    = 'customer';
let rankOrder   = 'desc';
let rankLimit   = 30;
let rankPeriod  = 'all';
let _rankSales  = [];
let _rankExps   = [];

function toggleRankPeriodMenu() {
  document.getElementById('rank-period-menu')?.classList.toggle('hidden');
}

function setRankPeriod(period, label) {
  rankPeriod = period;
  const btn = document.getElementById('rank-period-btn');
  if (btn) btn.innerHTML = label + ' <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  document.getElementById('rank-period-menu')?.classList.add('hidden');
  renderRankings();
}

function setRankType(type) {
  rankType = type;
  document.querySelectorAll('#rank-type-btns .rank-pill').forEach((b, i) => {
    b.classList.toggle('active', ['customer','product','category'][i] === type);
  });
  renderRankings();
}

function setRankOrder(order) {
  rankOrder = order;
  document.querySelectorAll('#rank-order-btns .rank-pill').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(order === 'desc' ? 'Highest' : 'Lowest'));
  });
  renderRankings();
}

function setRankLimit(limit) {
  rankLimit = limit;
  document.querySelectorAll('.rank-ctrl-group .rank-pill').forEach(b => {
    const n = b.textContent.trim();
    const match = limit === 0 ? n === 'All' : +n === limit;
    if (['5','10','20','30','50','All'].includes(n)) b.classList.toggle('active', match);
  });
  renderRankings();
}

async function loadRankings() {
  if (_rankSales.length === 0 && _rankExps.length === 0) {
    document.getElementById('loading-rankings')?.classList.remove('hidden');
    try {
      const [s, e] = await Promise.all([
        sheetsGet(`${SHEET_SALES}!A2:H5000`),
        sheetsGet(`${SHEET_EXPENSES}!A2:F5000`)
      ]);
      _rankSales = s.filter(r => r && r[0]);
      _rankExps  = e.filter(r => r && r[0]);
    } catch(err) {
      showToast('Could not load rankings data');
    }
    document.getElementById('loading-rankings')?.classList.add('hidden');
  }
  renderRankings();
}

function renderRankings() {
  const sales = filterByPeriod(_rankSales, 0, rankPeriod);
  const exps  = filterByPeriod(_rankExps,  0, rankPeriod);

  const titleEl = document.getElementById('rankings-title');
  const tableEl = document.getElementById('rankings-table');
  if (!tableEl) return;

  let grouped = {};
  let headers = [];
  let title   = '';
  let isMoney = true;

  if (rankType === 'customer') {
    title = 'Sales by customer';
    headers = ['#', 'Customer', 'Total (₵)', 'Orders', 'Unpaid (₵)'];
    sales.forEach(r => {
      const k = r[1] || 'Unknown';
      if (!grouped[k]) grouped[k] = { val: 0, count: 0, unpaid: 0 };
      grouped[k].val    += parseFloat(r[6]) || 0;
      grouped[k].count  += 1;
      grouped[k].unpaid += r[7] !== 'Paid' ? (parseFloat(r[6]) || 0) : 0;
    });
  } else if (rankType === 'product') {
    title = 'Sales by product';
    headers = ['#', 'Product', 'Total (₵)', 'Units sold', 'Share'];
    const totalRev = sales.reduce((a, r) => a + (parseFloat(r[6]) || 0), 0);
    sales.forEach(r => {
      const k = r[2] || 'Unknown';
      if (!grouped[k]) grouped[k] = { val: 0, count: 0, total: totalRev };
      grouped[k].val   += parseFloat(r[6]) || 0;
      grouped[k].count += parseInt(r[4])   || 0;
    });
  } else {
    title = 'Expenses by category';
    headers = ['#', 'Category', 'Total (₵)', 'Transactions', 'Share'];
    const totalExp = exps.reduce((a, r) => a + (parseFloat(r[4]) || 0), 0);
    exps.forEach(r => {
      const k = r[3] || 'Other';
      if (!grouped[k]) grouped[k] = { val: 0, count: 0, total: totalExp };
      grouped[k].val   += parseFloat(r[4]) || 0;
      grouped[k].count += 1;
    });
  }

  if (titleEl) titleEl.textContent = title;

  let entries = Object.entries(grouped).sort((a, b) =>
    rankOrder === 'desc' ? b[1].val - a[1].val : a[1].val - b[1].val
  );

  if (rankLimit > 0) entries = entries.slice(0, rankLimit);

  if (!entries.length) {
    tableEl.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:1rem;text-align:center">No data for selected period</p>';
    return;
  }

  const grandTotal = entries.reduce((a, [,v]) => a + v.val, 0);

  const rows = entries.map(([name, d], i) => {
    const rank = rankOrder === 'desc' ? i + 1 : entries.length - i;
    const share = grandTotal > 0 ? (d.val / grandTotal * 100).toFixed(1) + '%' : '—';
    const barW  = grandTotal > 0 ? Math.round(d.val / entries[0][1].val * 100) : 0;

    if (rankType === 'customer') {
      return `<tr>
        <td class="rank-num">${i + 1}</td>
        <td class="td-name">${esc(name)}</td>
        <td class="rank-val">${fmt(d.val)}</td>
        <td class="rank-secondary">${d.count}</td>
        <td class="rank-secondary" style="color:${d.unpaid > 0 ? 'var(--red)' : 'var(--text3)'}">${d.unpaid > 0 ? fmt(d.unpaid) : '—'}</td>
      </tr>
      <tr class="rank-bar-row"><td colspan="5"><div class="rank-bar-track"><div class="rank-bar-fill" style="width:${barW}%"></div></div></td></tr>`;
    } else {
      return `<tr>
        <td class="rank-num">${i + 1}</td>
        <td class="td-name">${esc(name)}</td>
        <td class="rank-val">${fmt(d.val)}</td>
        <td class="rank-secondary">${d.count}</td>
        <td class="rank-secondary">${share}</td>
      </tr>
      <tr class="rank-bar-row"><td colspan="5"><div class="rank-bar-track"><div class="rank-bar-fill" style="width:${barW}%"></div></div></td></tr>`;
    }
  }).join('');

  tableEl.innerHTML = `
    <div class="rank-summary">Showing ${entries.length} of ${Object.keys(grouped).length} • Total: ${fmt(grandTotal)}</div>
    <table class="analytics-table rank-table">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── EXPENSE PIE CHART ────────────────────────────────────────────────────────
function renderExpensePie(exps, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!exps.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:1rem">No data</p>'; return; }
  const grouped = {};
  exps.forEach(r => {
    const cat = r[3] || 'Other';
    const amt = parseFloat(r[4]) || 0;
    const key = cat.startsWith('Stock Purchase') ? 'Stock Purchases (All)' : cat;
    grouped[key] = (grouped[key] || 0) + amt;
  });
  const total = Object.values(grouped).reduce((a,b) => a+b, 0);
  if (!total) { el.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:1rem">No data</p>'; return; }
  const sorted = Object.entries(grouped).sort((a,b) => b[1]-a[1]);
  const colours = ['#7db84a','#e07070','#7ab8e8','#e8b84a','#a47de8','#e87ab8','#52c47a','#e89a4a','#4ab8e8','#c47a52','#8ae87a','#4ae8b8','#e8e84a'];
  const size = 200, cx = 100, cy = 100, outerR = 80, innerR = 50;
  let startAngle = -Math.PI/2, slices = '', legend = '';
  sorted.forEach(([name, val], i) => {
    const pct = val/total, angle = pct*2*Math.PI, endAngle = startAngle+angle;
    const x1=cx+outerR*Math.cos(startAngle), y1=cy+outerR*Math.sin(startAngle);
    const x2=cx+outerR*Math.cos(endAngle),   y2=cy+outerR*Math.sin(endAngle);
    const ix1=cx+innerR*Math.cos(endAngle),  iy1=cy+innerR*Math.sin(endAngle);
    const ix2=cx+innerR*Math.cos(startAngle),iy2=cy+innerR*Math.sin(startAngle);
    const la = angle>Math.PI?1:0, col = colours[i%colours.length];
    slices += `<path d="M ${x1} ${y1} A ${outerR} ${outerR} 0 ${la} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${la} 0 ${ix2} ${iy2} Z" fill="${col}" stroke="var(--bg)" stroke-width="2"/>`;
    const short = name.length>26 ? name.slice(0,24)+'…' : name;
    legend += `<div class="pie-legend-row"><span class="pie-dot" style="background:${col}"></span><span class="pie-legend-name">${esc(short)}</span><span class="pie-legend-pct">${(pct*100).toFixed(1)}%</span><span class="pie-legend-val">${fmt(val)}</span></div>`;
    startAngle = endAngle;
  });
  const cLabel = `<text x="100" y="94" text-anchor="middle" font-size="11" fill="var(--text2)" font-family="sans-serif">Total</text><text x="100" y="112" text-anchor="middle" font-size="13" font-weight="500" fill="var(--text)" font-family="sans-serif">${fmt(total)}</text>`;
  el.innerHTML = `<div class="pie-chart-wrap"><svg viewBox="0 0 200 200" width="200" height="200">${slices}${cLabel}</svg><div class="pie-legend">${legend}</div></div>`;
}
