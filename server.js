const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const defaultState = {
  organizations: [
    {
      id: 'org-1',
      name: 'CarTech Industrial Group',
      status: 'active',
      country: 'IR',
      city: 'Tehran',
      registeredNo: 'RT-10001'
    }
  ],
  users: [
    {
      id: 'user-1',
      name: 'Sajjad Rahimi',
      email: 'admin@cartech.ir',
      password: 'admin123',
      role: 'admin',
      department: 'Executive',
      organizationId: 'org-1',
      status: 'active',
      token: ''
    },
    {
      id: 'user-2',
      name: 'Farid Nouri',
      email: 'warehouse@cartech.ir',
      password: 'admin123',
      role: 'warehouse_manager',
      department: 'Warehouse',
      organizationId: 'org-1',
      status: 'active',
      token: ''
    },
    {
      id: 'user-3',
      name: 'Neda Ahmadi',
      email: 'sales@cartech.ir',
      password: 'admin123',
      role: 'sales_manager',
      department: 'Sales',
      organizationId: 'org-1',
      status: 'active',
      token: ''
    }
  ],
  warehouses: [
    { id: 'wh-1', name: 'Main Warehouse', code: 'WH-01', city: 'Tehran' },
    { id: 'wh-2', name: 'Spare Parts Hub', code: 'WH-02', city: 'Isfahan' }
  ],
  customers: [
    { id: 'cust-1', name: 'Tehran Auto Supply', type: 'dealer', creditLimit: 250000000 },
    { id: 'cust-2', name: 'Narmak Motors', type: 'retail', creditLimit: 90000000 },
    { id: 'cust-3', name: 'Khodro Gharb', type: 'fleet', creditLimit: 600000000 }
  ],
  vendors: [
    { id: 'ven-1', name: 'Apex Steel Co.', category: 'raw_material', paymentTerms: 'NET-30' },
    { id: 'ven-2', name: 'ElectroDrive Parts', category: 'electrical', paymentTerms: 'NET-15' }
  ],
  products: [
    {
      id: 'prod-1',
      sku: 'ENG-1100',
      name: 'Engine Block A110',
      category: 'Casting',
      unit: 'pcs',
      unitCost: 1800000,
      salePrice: 2400000,
      stock: 144,
      minStock: 30,
      warehouseId: 'wh-1'
    },
    {
      id: 'prod-2',
      sku: 'ALT-505',
      name: 'Alternator 12V',
      category: 'Electrical',
      unit: 'pcs',
      unitCost: 420000,
      salePrice: 590000,
      stock: 88,
      minStock: 25,
      warehouseId: 'wh-2'
    },
    {
      id: 'prod-3',
      sku: 'TYR-280',
      name: 'Heavy Duty Tire',
      category: 'Automotive',
      unit: 'pcs',
      unitCost: 1200000,
      salePrice: 1650000,
      stock: 66,
      minStock: 20,
      warehouseId: 'wh-1'
    }
  ],
  purchaseOrders: [
    {
      id: 'po-1',
      vendorId: 'ven-1',
      vendorName: 'Apex Steel Co.',
      status: 'approved',
      total: 36000000,
      createdAt: '2026-10-10T08:30:00.000Z'
    },
    {
      id: 'po-2',
      vendorId: 'ven-2',
      vendorName: 'ElectroDrive Parts',
      status: 'in_transit',
      total: 18500000,
      createdAt: '2026-10-20T14:15:00.000Z'
    }
  ],
  salesOrders: [
    {
      id: 'so-1',
      customerId: 'cust-1',
      customerName: 'Tehran Auto Supply',
      status: 'shipped',
      total: 18000000,
      createdAt: '2026-10-15T09:00:00.000Z'
    },
    {
      id: 'so-2',
      customerId: 'cust-2',
      customerName: 'Narmak Motors',
      status: 'draft',
      total: 9300000,
      createdAt: '2026-10-24T11:30:00.000Z'
    }
  ],
  invoices: [
    { id: 'inv-1', number: 'INV-2026-001', total: 18000000, status: 'paid', customerId: 'cust-1' },
    { id: 'inv-2', number: 'INV-2026-002', total: 9300000, status: 'open', customerId: 'cust-2' }
  ],
  accountingEntries: [
    { id: 'acc-1', type: 'expense', account: 'Raw Materials', amount: 36000000, date: '2026-10-10' },
    { id: 'acc-2', type: 'revenue', account: 'Sales', amount: 18000000, date: '2026-10-15' },
    { id: 'acc-3', type: 'asset', account: 'Inventory', amount: 17500000, date: '2026-10-22' }
  ],
  auditLogs: [
    { id: 'log-1', action: 'login', user: 'Sajjad Rahimi', detail: 'User signed in successfully', createdAt: '2026-10-28T08:00:00.000Z' },
    { id: 'log-2', action: 'stock_updated', user: 'Farid Nouri', detail: 'Inventory adjustment applied', createdAt: '2026-10-28T09:10:00.000Z' }
  ]
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultState, null, 2));
  }
}

function readState() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    return { ...defaultState };
  }
}

function writeState(state) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const state = readState();
  return state.users.find((user) => user.token === token && user.status === 'active') || null;
}

function requireAuth(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { ok: false, message: 'Unauthorized. Please sign in.' });
    return;
  }
  req.user = user;
  next();
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    organizationId: user.organizationId,
    status: user.status
  };
}

function addAudit(state, action, detail, userName) {
  state.auditLogs.unshift({
    id: generateId('log'),
    action,
    detail,
    user: userName || 'system',
    createdAt: new Date().toISOString()
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function serveStaticFile(filePath, res) {
  const sanitized = String(filePath || '').replace(/^\/+/, '');
  const safePath = path.normalize(sanitized).replace(/^\.\./, '');
  const actualPath = path.join(PUBLIC_DIR, safePath);

  if (!actualPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { ok: false, message: 'Forbidden' });
    return;
  }

  fs.readFile(actualPath, (error, content) => {
    if (error) {
      sendJson(res, 404, { ok: false, message: 'Not found' });
      return;
    }

    const ext = path.extname(actualPath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

function getDashboardSnapshot(state) {
  const totalInventory = state.products.reduce((sum, product) => sum + toNumber(product.stock, 0), 0);
  const inventoryValue = state.products.reduce((sum, product) => sum + (toNumber(product.stock, 0) * toNumber(product.unitCost, 0)), 0);
  const revenue = state.invoices.reduce((sum, invoice) => sum + toNumber(invoice.total || 0, 0), 0);
  const expenses = state.accountingEntries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + toNumber(entry.amount || 0, 0), 0);
  const openOrders = state.salesOrders.filter((order) => !['paid', 'shipped'].includes(order.status)).length;

  return {
    summary: {
      organizations: state.organizations.length,
      users: state.users.length,
      products: state.products.length,
      inventoryUnits: totalInventory,
      totalRevenue: revenue,
      totalExpense: expenses,
      inventoryValue,
      openOrders
    },
    latestActivity: state.auditLogs.slice(0, 6),
    lowStock: state.products.filter((product) => toNumber(product.stock, 0) <= toNumber(product.minStock, 0))
  };
}

function normalizeProduct(payload, state) {
  return {
    id: payload.id || generateId('prod'),
    sku: payload.sku || `SKU-${Date.now()}`,
    name: payload.name || 'New Product',
    category: payload.category || 'General',
    unit: payload.unit || 'pcs',
    unitCost: toNumber(payload.unitCost, 0),
    salePrice: toNumber(payload.salePrice, 0),
    stock: toNumber(payload.stock, 0),
    minStock: toNumber(payload.minStock, 0),
    warehouseId: payload.warehouseId || state.warehouses[0]?.id || 'wh-1'
  };
}

function normalizeOrganization(payload) {
  return {
    id: payload.id || generateId('org'),
    name: payload.name || 'New Organization',
    status: payload.status || 'active',
    country: payload.country || 'IR',
    city: payload.city || 'Tehran',
    registeredNo: payload.registeredNo || `ORG-${Date.now()}`
  };
}

function normalizeUserPayload(payload, state) {
  return {
    id: payload.id || generateId('user'),
    name: payload.name || 'New User',
    email: String(payload.email || '').trim().toLowerCase(),
    password: payload.password || 'changeme',
    role: payload.role || 'operator',
    department: payload.department || 'Operations',
    organizationId: payload.organizationId || state.organizations[0]?.id || 'org-1',
    status: payload.status || 'active',
    token: ''
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile('index.html', res);
    return;
  }

  if (pathname === '/styles.css' || pathname === '/app.js' || pathname === '/favicon.ico') {
    serveStaticFile(pathname.replace(/^\//, ''), res);
    return;
  }

  if (pathname.startsWith('/assets/') || pathname.startsWith('/public/')) {
    serveStaticFile(pathname.replace(/^\//, ''), res);
    return;
  }

  if (pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, { ok: true, message: 'ERP engine is running.', time: new Date().toISOString() });
    return;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    parseBody(req).then((payload) => {
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const state = readState();
      const user = state.users.find((item) => item.email === email && item.password === password && item.status === 'active');

      if (!user) {
        sendJson(res, 401, { ok: false, message: 'Invalid credentials.' });
        return;
      }

      const token = crypto.randomBytes(24).toString('hex');
      user.token = token;
      addAudit(state, 'login', 'User signed in successfully', user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, token, user: normalizeUser(user) });
    }).catch((error) => {
      sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
    });
    return;
  }

  if (pathname === '/api/dashboard' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: getDashboardSnapshot(state) });
    });
    return;
  }

  if (pathname === '/api/organizations' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.organizations });
    });
    return;
  }

  if (pathname === '/api/users' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.users.map(normalizeUser) });
    });
    return;
  }

  if (pathname === '/api/products' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.products });
    });
    return;
  }

  if (pathname === '/api/purchase-orders' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.purchaseOrders });
    });
    return;
  }

  if (pathname === '/api/sales-orders' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.salesOrders });
    });
    return;
  }

  if (pathname === '/api/invoices' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.invoices });
    });
    return;
  }

  if (pathname === '/api/finance' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      const totals = state.accountingEntries.reduce((acc, entry) => {
        acc[entry.type] = (acc[entry.type] || 0) + toNumber(entry.amount || 0, 0);
        return acc;
      }, {});
      sendJson(res, 200, { ok: true, data: { totals, entries: state.accountingEntries } });
    });
    return;
  }

  if (pathname === '/api/audit' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: state.auditLogs });
    });
    return;
  }

  if (pathname === '/api/warehouse' && method === 'GET') {
    requireAuth(req, res, () => {
      const state = readState();
      sendJson(res, 200, { ok: true, data: { warehouses: state.warehouses, products: state.products } });
    });
    return;
  }

  if (pathname === '/api/organizations' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const item = normalizeOrganization(payload);
        state.organizations.push(item);
        addAudit(state, 'organization_created', item.name, req.user.name);
        writeState(state);
        sendJson(res, 201, { ok: true, data: item });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/users' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const user = normalizeUserPayload(payload, state);
        state.users.push(user);
        addAudit(state, 'user_created', user.name, req.user.name);
        writeState(state);
        sendJson(res, 201, { ok: true, data: normalizeUser(user) });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/products' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const product = normalizeProduct(payload, state);
        state.products.push(product);
        addAudit(state, 'product_created', product.name, req.user.name);
        writeState(state);
        sendJson(res, 201, { ok: true, data: product });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/purchase-orders' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const order = {
          id: payload.id || generateId('po'),
          vendorId: payload.vendorId || 'ven-1',
          vendorName: payload.vendorName || 'Supplier',
          status: payload.status || 'draft',
          total: toNumber(payload.total, 0),
          createdAt: payload.createdAt || new Date().toISOString()
        };
        state.purchaseOrders.push(order);
        addAudit(state, 'purchase_order_created', order.id, req.user.name);
        writeState(state);
        sendJson(res, 201, { ok: true, data: order });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/sales-orders' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const order = {
          id: payload.id || generateId('so'),
          customerId: payload.customerId || 'cust-1',
          customerName: payload.customerName || 'Customer',
          status: payload.status || 'draft',
          total: toNumber(payload.total, 0),
          createdAt: payload.createdAt || new Date().toISOString()
        };
        state.salesOrders.push(order);
        addAudit(state, 'sales_order_created', order.id, req.user.name);
        writeState(state);
        sendJson(res, 201, { ok: true, data: order });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/warehouse' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const product = state.products.find((item) => item.id === payload.productId);
        if (!product) {
          sendJson(res, 404, { ok: false, message: 'Product not found.' });
          return;
        }
        product.stock = toNumber(product.stock, 0) + toNumber(payload.delta, 0);
        addAudit(state, 'inventory_adjusted', `${product.name}: ${payload.delta}`, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: product });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/organizations' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const item = state.organizations.find((org) => org.id === payload.id);
        if (!item) {
          sendJson(res, 404, { ok: false, message: 'Organization not found.' });
          return;
        }
        Object.keys(payload).forEach((key) => {
          if (key !== 'id') item[key] = payload[key];
        });
        addAudit(state, 'organization_updated', item.name, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: item });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/users' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const user = state.users.find((item) => item.id === payload.id);
        if (!user) {
          sendJson(res, 404, { ok: false, message: 'User not found.' });
          return;
        }
        Object.keys(payload).forEach((key) => {
          if (key !== 'id') user[key] = payload[key];
        });
        addAudit(state, 'user_updated', user.name, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: normalizeUser(user) });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/products' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const product = state.products.find((item) => item.id === payload.id);
        if (!product) {
          sendJson(res, 404, { ok: false, message: 'Product not found.' });
          return;
        }
        Object.keys(payload).forEach((key) => {
          if (key !== 'id') product[key] = payload[key];
        });
        addAudit(state, 'product_updated', product.name, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: product });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/purchase-orders' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const item = state.purchaseOrders.find((entry) => entry.id === payload.id);
        if (!item) {
          sendJson(res, 404, { ok: false, message: 'Purchase order not found.' });
          return;
        }
        Object.keys(payload).forEach((key) => {
          if (key !== 'id') item[key] = payload[key];
        });
        addAudit(state, 'purchase_order_updated', item.id, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: item });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/sales-orders' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const item = state.salesOrders.find((entry) => entry.id === payload.id);
        if (!item) {
          sendJson(res, 404, { ok: false, message: 'Sales order not found.' });
          return;
        }
        Object.keys(payload).forEach((key) => {
          if (key !== 'id') item[key] = payload[key];
        });
        addAudit(state, 'sales_order_updated', item.id, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: item });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname === '/api/warehouse' && method === 'PATCH') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const product = state.products.find((item) => item.id === payload.productId);
        if (!product) {
          sendJson(res, 404, { ok: false, message: 'Product not found.' });
          return;
        }
        product.stock = toNumber(payload.stock, product.stock);
        product.minStock = toNumber(payload.minStock, product.minStock);
        product.warehouseId = payload.warehouseId || product.warehouseId;
        addAudit(state, 'inventory_edited', `${product.name} warehouse details updated`, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: product });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
    });
    return;
  }

  if (pathname.startsWith('/api/organizations/') && method === 'DELETE') {
    requireAuth(req, res, () => {
      const state = readState();
      const id = pathname.split('/').at(-1);
      const index = state.organizations.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { ok: false, message: 'Organization not found.' });
        return;
      }
      const [removed] = state.organizations.splice(index, 1);
      addAudit(state, 'organization_deleted', removed.name, req.user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, data: removed });
    });
    return;
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    requireAuth(req, res, () => {
      const state = readState();
      const id = pathname.split('/').at(-1);
      const index = state.users.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { ok: false, message: 'User not found.' });
        return;
      }
      const [removed] = state.users.splice(index, 1);
      addAudit(state, 'user_deleted', removed.name, req.user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, data: removed });
    });
    return;
  }

  if (pathname.startsWith('/api/products/') && method === 'DELETE') {
    requireAuth(req, res, () => {
      const state = readState();
      const id = pathname.split('/').at(-1);
      const index = state.products.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { ok: false, message: 'Product not found.' });
        return;
      }
      const [removed] = state.products.splice(index, 1);
      addAudit(state, 'product_deleted', removed.name, req.user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, data: removed });
    });
    return;
  }

  if (pathname.startsWith('/api/purchase-orders/') && method === 'DELETE') {
    requireAuth(req, res, () => {
      const state = readState();
      const id = pathname.split('/').at(-1);
      const index = state.purchaseOrders.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { ok: false, message: 'Purchase order not found.' });
        return;
      }
      const [removed] = state.purchaseOrders.splice(index, 1);
      addAudit(state, 'purchase_order_deleted', removed.id, req.user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, data: removed });
    });
    return;
  }

  if (pathname.startsWith('/api/sales-orders/') && method === 'DELETE') {
    requireAuth(req, res, () => {
      const state = readState();
      const id = pathname.split('/').at(-1);
      const index = state.salesOrders.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { ok: false, message: 'Sales order not found.' });
        return;
      }
      const [removed] = state.salesOrders.splice(index, 1);
      addAudit(state, 'sales_order_deleted', removed.id, req.user.name);
      writeState(state);
      sendJson(res, 200, { ok: true, data: removed });
    });
    return;
  }

  if (pathname.startsWith('/api/') && method === 'GET') {
    sendJson(res, 404, { ok: false, message: 'Endpoint not found.' });
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Not found' });
});

ensureStore();
server.listen(PORT, () => {
  console.log(`ERP demo listening on http://localhost:${PORT}`);
});
