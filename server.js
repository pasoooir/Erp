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
    { id: 'log-1', action: 'login', user: 'Sajjad Rahimi', createdAt: '2026-10-28T08:00:00.000Z' },
    { id: 'log-2', action: 'stock_updated', user: 'Farid Nouri', createdAt: '2026-10-28T09:10:00.000Z' }
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
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  return JSON.parse(raw || '{}');
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
  const safePath = path.normalize(filePath).replace(/^\.+/, '');
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
  const totalInventory = state.products.reduce((sum, product) => sum + product.stock, 0);
  const inventoryValue = state.products.reduce((sum, product) => sum + (product.stock * product.unitCost), 0);
  const revenue = state.invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const expenses = state.accountingEntries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const openOrders = state.salesOrders.filter((order) => order.status !== 'paid' && order.status !== 'shipped').length;

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
    lowStock: state.products.filter((product) => product.stock <= product.minStock)
  };
}

const routes = {
  GET: {
    '/api/health': (req, res) => {
      sendJson(res, 200, { ok: true, message: 'ERP engine is running.', time: new Date().toISOString() });
    },
    '/api/dashboard': requireAuth,
    '/api/organizations': requireAuth,
    '/api/users': requireAuth,
    '/api/products': requireAuth,
    '/api/purchase-orders': requireAuth,
    '/api/sales-orders': requireAuth,
    '/api/invoices': requireAuth,
    '/api/finance': requireAuth,
    '/api/audit': requireAuth,
    '/api/warehouse': requireAuth
  },
  POST: {
    '/api/auth/login': (req, res) => {
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
    },
    '/api/organizations': requireAuth,
    '/api/users': requireAuth,
    '/api/products': requireAuth,
    '/api/purchase-orders': requireAuth,
    '/api/sales-orders': requireAuth,
    '/api/warehouse': requireAuth
  },
  PATCH: {
    '/api/products': requireAuth,
    '/api/users': requireAuth
  }
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile('index.html', res);
    return;
  }

  if (pathname.startsWith('/assets/') || pathname.startsWith('/public/')) {
    serveStaticFile(pathname.replace(/^\//, ''), res);
    return;
  }

  const method = req.method.toUpperCase();

  if (pathname === '/api/auth/login' && method === 'POST') {
    routes.POST[pathname](req, res);
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
        acc[entry.type] = (acc[entry.type] || 0) + Number(entry.amount || 0);
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
        const item = { id: generateId('org'), name: payload.name || 'New Organization', status: 'active', country: payload.country || 'IR', city: payload.city || 'Tehran' };
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
        const user = {
          id: generateId('user'),
          name: payload.name || 'New User',
          email: (payload.email || '').toLowerCase(),
          password: payload.password || 'changeme',
          role: payload.role || 'operator',
          department: payload.department || 'Operations',
          organizationId: payload.organizationId || state.organizations[0]?.id || 'org-1',
          status: 'active',
          token: ''
        };

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
        const product = {
          id: generateId('prod'),
          sku: payload.sku || `SKU-${Date.now()}`,
          name: payload.name || 'New Product',
          category: payload.category || 'General',
          unit: payload.unit || 'pcs',
          unitCost: Number(payload.unitCost || 0),
          salePrice: Number(payload.salePrice || 0),
          stock: Number(payload.stock || 0),
          minStock: Number(payload.minStock || 0),
          warehouseId: payload.warehouseId || state.warehouses[0]?.id || 'wh-1'
        };
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

  if (pathname === '/api/purchase-orders' && method === 'POST') {
    requireAuth(req, res, () => {
      parseBody(req).then((payload) => {
        const state = readState();
        const order = {
          id: generateId('po'),
          vendorId: payload.vendorId || 'ven-1',
          vendorName: payload.vendorName || 'Supplier',
          status: payload.status || 'draft',
          total: Number(payload.total || 0),
          createdAt: new Date().toISOString()
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
          id: generateId('so'),
          customerId: payload.customerId || 'cust-1',
          customerName: payload.customerName || 'Customer',
          status: payload.status || 'draft',
          total: Number(payload.total || 0),
          createdAt: new Date().toISOString()
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
        product.stock = Number(product.stock || 0) + Number(payload.delta || 0);
        addAudit(state, 'inventory_adjusted', `${product.name}: ${payload.delta}`, req.user.name);
        writeState(state);
        sendJson(res, 200, { ok: true, data: product });
      }).catch((error) => {
        sendJson(res, 400, { ok: false, message: error.message || 'Bad request' });
      });
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
