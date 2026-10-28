const appState = {
  token: localStorage.getItem('erp_token') || '',
  user: JSON.parse(localStorage.getItem('erp_user') || 'null')
};

const views = {
  dashboard: document.getElementById('dashboardView'),
  organizations: document.getElementById('organizationsView'),
  users: document.getElementById('usersView'),
  products: document.getElementById('productsView'),
  warehouse: document.getElementById('warehouseView'),
  purchases: document.getElementById('purchasesView'),
  sales: document.getElementById('salesView'),
  finance: document.getElementById('financeView'),
  audit: document.getElementById('auditView')
};

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userBadge = document.getElementById('userBadge');

function setView(viewName) {
  Object.entries(views).forEach(([name, element]) => {
    element.classList.toggle('hidden', name !== viewName);
    element.classList.toggle('active', name === viewName);
  });

  document.querySelectorAll('.nav-item').forEach((button) => {
    const active = button.dataset.view === viewName;
    button.classList.toggle('active', active);
  });
}

function loadAuthState() {
  if (appState.token && appState.user) {
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    userBadge.textContent = appState.user.name;
    loadDashboard();
    return;
  }

  authView.classList.remove('hidden');
  appView.classList.add('hidden');
}

function clearAuthState() {
  appState.token = '';
  appState.user = null;
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
  loadAuthState();
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (appState.token) {
    headers.Authorization = `Bearer ${appState.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

function money(value) {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fa-IR');
}

function renderCardGrid(items) {
  const container = document.getElementById('summaryCards');
  container.innerHTML = items.map((item) => `
    <div class="card">
      <h4>${item.label}</h4>
      <strong>${item.value}</strong>
    </div>
  `).join('');
}

function renderList(items, containerId) {
  const container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = '<p>داده‌ای وجود ندارد.</p>';
    return;
  }

  container.innerHTML = `
    <div class="list">
      ${items.map((item) => `
        <div class="list-item">
          <span>${item.title}</span>
          <strong>${item.value}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTable(rows, columns, containerId) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = '<p>داده‌ای برای نمایش وجود ندارد.</p>';
    return;
  }

  const headers = columns.map((column) => `<th>${column.header}</th>`).join('');
  const body = rows.map((row) => `
    <tr>
      ${columns.map((column) => `<td>${column.render ? column.render(row) : (row[column.key] ?? '—')}</td>`).join('')}
    </tr>
  `).join('');

  container.innerHTML = `
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function loadDashboard() {
  try {
    const response = await apiFetch('/api/dashboard');
    const { summary, latestActivity, lowStock } = response.data;

    renderCardGrid([
      { label: 'سازمان‌ها', value: summary.organizations },
      { label: 'کاربران', value: summary.users },
      { label: 'محصولات', value: summary.products },
      { label: 'موجودی کل', value: money(summary.inventoryUnits) },
      { label: 'دارایی انبار', value: `${money(summary.inventoryValue)} تومان` },
      { label: 'درآمد', value: `${money(summary.totalRevenue)} تومان` }
    ]);

    renderList(latestActivity.map((item) => ({ title: item.action, value: fmtDate(item.createdAt) })), 'activityList');
    renderList(lowStock.map((item) => ({ title: item.name, value: `${item.stock} / ${item.minStock}` })), 'lowStockList');

    const financeCards = document.getElementById('financeCards');
    if (financeCards) {
      const totals = (await apiFetch('/api/finance')).data.totals;
      financeCards.innerHTML = `
        <div class="card"><h4>درآمد</h4><strong>${money(totals.revenue || 0)} تومان</strong></div>
        <div class="card"><h4>هزینه</h4><strong>${money(totals.expense || 0)} تومان</strong></div>
        <div class="card"><h4>دارایی</h4><strong>${money(totals.asset || 0)} تومان</strong></div>
      `;
    }
  } catch (error) {
    console.error(error);
    clearAuthState();
  }
}

async function loadOrganizations() {
  const response = await apiFetch('/api/organizations');
  const rows = response.data;
  renderTable(rows, [
    { header: 'نام', key: 'name' },
    { header: 'وضعیت', key: 'status' },
    { header: 'شهر', key: 'city' },
    { header: 'کشور', key: 'country' }
  ], 'organizationsTable');
}

async function loadUsers() {
  const response = await apiFetch('/api/users');
  renderTable(response.data, [
    { header: 'نام', key: 'name' },
    { header: 'ایمیل', key: 'email' },
    { header: 'دپارتمان', key: 'department' },
    { header: 'نقش', key: 'role' },
    { header: 'وضعیت', key: 'status' }
  ], 'usersTable');
}

async function loadProducts() {
  const response = await apiFetch('/api/products');
  renderTable(response.data, [
    { header: 'کد', key: 'sku' },
    { header: 'نام', key: 'name' },
    { header: 'دسته', key: 'category' },
    { header: 'قیمت فروش', key: 'salePrice', render: (row) => `${money(row.salePrice)} تومان` },
    { header: 'موجودی', key: 'stock' },
    { header: 'حداقل', key: 'minStock' }
  ], 'productsTable');
}

async function loadWarehouse() {
  const response = await apiFetch('/api/warehouse');
  const { warehouses, products } = response.data;
  renderTable(products, [
    { header: 'محصول', key: 'name' },
    { header: 'انبار', key: 'warehouseId', render: (row) => warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.name || row.warehouseId },
    { header: 'موجودی', key: 'stock' },
    { header: 'حداقل', key: 'minStock' }
  ], 'warehouseTable');
}

async function loadPurchases() {
  const response = await apiFetch('/api/purchase-orders');
  renderTable(response.data, [
    { header: 'شناسه', key: 'id' },
    { header: 'تامین‌کننده', key: 'vendorName' },
    { header: 'قیمت', key: 'total', render: (row) => `${money(row.total)} تومان` },
    { header: 'وضعیت', key: 'status' },
    { header: 'تاریخ', key: 'createdAt', render: (row) => fmtDate(row.createdAt) }
  ], 'purchaseOrdersTable');
}

async function loadSales() {
  const response = await apiFetch('/api/sales-orders');
  renderTable(response.data, [
    { header: 'شناسه', key: 'id' },
    { header: 'مشتری', key: 'customerName' },
    { header: 'قیمت', key: 'total', render: (row) => `${money(row.total)} تومان` },
    { header: 'وضعیت', key: 'status' },
    { header: 'تاریخ', key: 'createdAt', render: (row) => fmtDate(row.createdAt) }
  ], 'salesOrdersTable');
}

async function loadFinance() {
  const response = await apiFetch('/api/finance');
  const entries = response.data.entries;
  renderTable(entries, [
    { header: 'نوع', key: 'type' },
    { header: 'حساب', key: 'account' },
    { header: 'مبلغ', key: 'amount', render: (row) => `${money(row.amount)} تومان` },
    { header: 'تاریخ', key: 'date' }
  ], 'financeTable');
}

async function loadAudit() {
  const response = await apiFetch('/api/audit');
  renderTable(response.data, [
    { header: 'عملیات', key: 'action' },
    { header: 'کاربر', key: 'user' },
    { header: 'توضیح', key: 'detail' },
    { header: 'زمان', key: 'createdAt', render: (row) => fmtDate(row.createdAt) }
  ], 'auditTable');
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadOrganizations(),
    loadUsers(),
    loadProducts(),
    loadWarehouse(),
    loadPurchases(),
    loadSales(),
    loadFinance(),
    loadAudit()
  ]);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    appState.token = result.token;
    appState.user = result.user;
    localStorage.setItem('erp_token', result.token);
    localStorage.setItem('erp_user', JSON.stringify(result.user));
    loginError.classList.add('hidden');
    loadAuthState();
    await refreshAll();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', clearAuthState);

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    setView(button.dataset.view);
  });
});

loadAuthState();
