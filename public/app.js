 :root {
  --bg: #f3f7fb;
  --bg-strong: #eaf1ff;
  --panel: #ffffff;
  --panel-soft: #f8fbff;
  --panel-alt: #eef3ff;
  --primary: #1947b2;
  --primary-dark: #102f7d;
  --primary-soft: rgba(25, 71, 178, 0.12);
  --success: #0f9f6e;
  --warning: #d08700;
  --danger: #d93a3a;
  --text: #1a2437;
  --muted: #64748b;
  --border: #dfe8f5;
  --shadow: 0 18px 40px rgba(16, 47, 125, 0.08);
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  font-family: Tahoma, Arial, sans-serif;
  background: linear-gradient(180deg, var(--bg-strong) 0%, var(--bg) 100%);
  color: var(--text);
  direction: rtl;
}

body {
  min-height: 100vh;
}

button,
input,
select {
  font: inherit;
}

button {
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:hover {
  transform: translateY(-1px);
}

.hidden {
  display: none !important;
}

.auth-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at top, rgba(25, 71, 178, 0.1), transparent 50%), linear-gradient(135deg, #edf3ff 0%, #f6faff 100%);
}

.login-box {
  width: min(430px, 92vw);
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.7);
  border-radius: 24px;
  box-shadow: var(--shadow);
  padding: 2rem;
  text-align: center;
}

.brand-mark {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  margin: 0 auto 1rem;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--primary), #3e79ff);
  color: white;
  font-weight: 700;
  font-size: 1.5rem;
  box-shadow: 0 18px 34px rgba(25, 71, 178, 0.2);
}

.login-box h1 {
  margin: 0 0 0.5rem;
  color: var(--primary-dark);
  font-size: 2rem;
}

.login-box p {
  margin: 0 0 1.5rem;
  color: var(--muted);
  line-height: 1.8;
}

#loginForm {
  display: grid;
  gap: 1rem;
  text-align: right;
}

#loginForm label {
  display: grid;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.92rem;
}

#loginForm input,
.search-box input,
.form-field input,
.form-field select {
  width: 100%;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--border);
  background: var(--panel-soft);
  border-radius: 12px;
  color: var(--text);
  outline: none;
}

#loginForm input:focus,
.search-box input:focus,
.form-field input:focus,
.form-field select:focus {
  border-color: rgba(25, 71, 178, 0.4);
  box-shadow: 0 0 0 4px rgba(25, 71, 178, 0.08);
}

.primary-btn,
.ghost-btn,
#logoutBtn,
.nav-item {
  border-radius: 12px;
  padding: 0.8rem 1rem;
  font-weight: 600;
}

.primary-btn,
#logoutBtn {
  background: linear-gradient(135deg, var(--primary), #2d63e6);
  color: #fff;
  box-shadow: 0 12px 22px rgba(25, 71, 178, 0.2);
}

.ghost-btn {
  background: var(--panel-alt);
  color: var(--primary-dark);
}

.error {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  color: var(--danger);
  background: rgba(217, 58, 58, 0.08);
  border: 1px solid rgba(217, 58, 58, 0.14);
  border-radius: 12px;
}

.app-shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

.sidebar {
  background: linear-gradient(180deg, #101f42 0%, #172b52 100%);
  color: white;
  padding: 1.4rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.5rem 0.5rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.12);
}

.brand-block .brand-mark {
  width: 52px;
  height: 52px;
  font-size: 1.2rem;
  margin: 0;
}

.brand-block h3 {
  margin: 0;
  font-size: 1.1rem;
}

.brand-block small {
  color: rgba(255,255,255,0.7);
}

.sidebar-nav {
  display: grid;
  gap: 0.5rem;
}

.nav-item {
  background: transparent;
  color: rgba(255,255,255,0.8);
  text-align: right;
  border: 1px solid transparent;
}

.nav-item.active {
  background: rgba(255,255,255,0.08);
  color: white;
  border-color: rgba(255,255,255,0.14);
}

.sidebar-footer {
  margin-top: auto;
  padding: 1rem 0.6rem 0;
  border-top: 1px solid rgba(255,255,255,0.12);
  display: grid;
  gap: 0.7rem;
}

.sidebar-footer span {
  color: rgba(255,255,255,0.7);
  font-size: 0.8rem;
}

#userBadge {
  display: inline-block;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  padding: 0.6rem 0.8rem;
  border-radius: 999px;
  color: white;
  text-align: center;
}

.main-panel {
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.2rem 1.6rem;
  background: rgba(255,255,255,0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.topbar-title {
  display: grid;
  gap: 0.3rem;
}

.topbar-title h2 {
  margin: 0;
  color: var(--primary-dark);
}

#todayStamp {
  color: var(--muted);
  font-size: 0.82rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 220px;
  padding: 0.6rem 0.8rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--muted);
}

.search-box input {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--muted);
}

.workspace {
  padding: 1.4rem 1.6rem 1.8rem;
}

.page {
  display: block;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.page-header h3 {
  margin: 0;
  font-size: 1.6rem;
  color: var(--primary-dark);
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.card {
  background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 1rem 1.1rem;
}

.card h4 {
  margin: 0 0 0.6rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.card strong {
  display: block;
  color: var(--primary-dark);
  font-size: 1.55rem;
  line-height: 1.4;
}

.panel-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 1rem;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 1rem 1.1rem;
}

.panel-header {
  margin-bottom: 0.8rem;
}

.panel-header h3 {
  margin: 0;
  color: var(--primary-dark);
  font-size: 1.1rem;
}

.list-wrap {
  display: grid;
  gap: 0.75rem;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0.8rem;
  border-radius: 12px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
}

.list-item span {
  color: var(--text);
}

.list-item strong {
  color: var(--primary-dark);
  font-size: 0.82rem;
}

.table-wrap {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.table-wrap table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th, td {
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--border);
  text-align: right;
  vertical-align: middle;
}

th {
  background: #f7faff;
  color: var(--primary-dark);
  font-size: 0.85rem;
}

tr:last-child td {
  border-bottom: none;
}

.status-pill {
  display: inline-block;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.status-active,
.status-paid,
.status-shipped,
.status-approved {
  background: rgba(15, 159, 110, 0.12);
  color: var(--success);
}

.status-draft,
.status-open,
.status-in_transit,
.status-warning {
  background: rgba(208, 135, 0, 0.12);
  color: var(--warning);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(16, 31, 66, 0.46);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.modal-card {
  width: min(620px, 96vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: 0 32px 72px rgba(16, 31, 66, 0.24);
  padding: 1.2rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.modal-header h3 {
  margin: 0;
  color: var(--primary-dark);
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--panel-soft);
  color: var(--text);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-field {
  display: grid;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.form-field.full {
  grid-column: 1 / -1;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.2rem;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    padding-bottom: 0.8rem;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .topbar,
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace {
    padding: 1rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
