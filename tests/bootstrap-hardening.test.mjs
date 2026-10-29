import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = [
  "0001_erp_foundation.sql",
  "0002_scoped_rbac.sql",
  "0003_auth_username.sql"
];
const migrations = migrationFiles.map(file =>
  fs.readFileSync(path.join(root, "migrations", file), "utf8")
);

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values), success: true }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) this.sqlite.exec(migration);
    this.batchQueue = Promise.resolve();
  }
  prepare(sql) { return new Statement(this.sqlite, sql); }
  async batch(statements) {
    const previous = this.batchQueue;
    let release;
    this.batchQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      this.sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        this.sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        this.sqlite.exec("ROLLBACK");
        throw error;
      }
    } finally {
      release();
    }
  }
}

const TEST_SECRET = "test-only-bootstrap-secret-that-is-long-enough-32";
const PASSWORD = "diagnostic-test-password-123";
const json = value => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value)
});
const parse = response => response.json();
const cookieFrom = response => response.headers.get("set-cookie").split(";")[0];

function harness({ secret = TEST_SECRET } = {}) {
  const DB = new TestD1();
  const env = { DB, BOOTSTRAP_SECRET: secret, APP_ORIGIN: "http://localhost:8787" };
  const call = (url, options = {}) =>
    worker.fetch(new Request("http://localhost:8787" + url, options), env);
  return { DB, env, call };
}

function bootstrapOptions(body, secret = TEST_SECRET) {
  return {
    ...json(body),
    headers: { "content-type": "application/json", "x-bootstrap-secret": secret }
  };
}

test("bootstrap writes one admin, audit event and completion state, then login succeeds", async () => {
  const { DB, call } = harness();
  const body = {
    username: "diagadmin",
    email: "diagadmin@example.invalid",
    display_name: "Diagnostic Admin",
    password: PASSWORD
  };

  const created = await call("/api/v1/auth/bootstrap", bootstrapOptions(body));
  assert.equal(created.status, 201, await created.clone().text());
  const responseBody = await parse(created);
  assert.deepEqual(responseBody.data.roles, ["admin"]);
  assert.equal(JSON.stringify(responseBody).includes(PASSWORD), false);
  assert.equal(JSON.stringify(responseBody).includes(TEST_SECRET), false);

  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin'").get().n, 1);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='auth.bootstrap_completed'").get().n, 1);
  assert.equal(DB.sqlite.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").get().bootstrap_complete, 1);
  assert.notEqual(DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash, PASSWORD);

  const me = await call("/api/v1/auth/me", { headers: { cookie: cookieFrom(created) } });
  assert.equal(me.status, 200);
  assert.deepEqual((await parse(me)).data.roles, ["admin"]);

  const login = await call("/api/v1/auth/login", json({ username: "diagadmin", password: PASSWORD }));
  assert.equal(login.status, 200, await login.clone().text());
  assert.deepEqual((await parse(login)).data.roles, ["admin"]);
});

test("invalid and missing bootstrap authorization do not mutate the database", async () => {
  const { DB, call } = harness();
  const body = {
    username: "diagadmin",
    email: "diagadmin@example.invalid",
    display_name: "Diagnostic Admin",
    password: PASSWORD
  };

  const invalid = await call("/api/v1/auth/bootstrap", bootstrapOptions(body, "incorrect-test-secret"));
  assert.equal(invalid.status, 403);
  const missing = await call("/api/v1/auth/bootstrap", json(body));
  assert.equal(missing.status, 403);

  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles").get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").get().bootstrap_complete, 0);
});

test("bootstrap diagnostics redact all submitted values from error logs", async () => {
  const { DB, call } = harness();
  const body = {
    username: "private-test-username",
    email: "private-test@example.invalid",
    display_name: "Private Test Display",
    password: "private-test-password-123"
  };
  const suppliedSecret = TEST_SECRET;
  DB.batch = async () => {
    throw new Error(
      "D1_ERROR: simulated constraint failure " +
      "username=" + body.username + " email=" + body.email +
      " display_name=" + body.display_name + " password=" + body.password +
      " x-bootstrap-secret=" + suppliedSecret
    );
  };

  const captured = [];
  const originalError = console.error;
  console.error = (...args) => captured.push(args);
  let response;
  try {
    response = await call("/api/v1/auth/bootstrap", bootstrapOptions(body, suppliedSecret));
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 500);
  assert.equal((await parse(response)).error.code, "bootstrap_failed");
  assert.equal(captured.length, 1);
  const logs = JSON.stringify(captured);
  for (const sensitive of [
    body.username, body.email, body.display_name, body.password, suppliedSecret
  ]) assert.equal(logs.includes(sensitive), false, "sensitive value appeared in logs");
  assert.equal(logs.includes("D1_ERROR"), true);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").get().bootstrap_complete, 0);
});
