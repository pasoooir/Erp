import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "migrations/0001_erp_foundation.sql"), "utf8");
class Statement {
  constructor(db, sql, values = []) { this.db=db; this.sql=sql; this.values=values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values), success: true }; }
  async run() { const result=this.db.prepare(this.sql).run(...this.values); return { success:true, meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid||0)} }; }
}
class TestD1 {
  constructor() { this.sqlite=new DatabaseSync(":memory:"); this.sqlite.exec(migration); }
  prepare(sql) { return new Statement(this.sqlite,sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results=[];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch(error) { this.sqlite.exec("ROLLBACK"); throw error; }
  }
}
function harness() {
  const DB=new TestD1();
  const env={ DB, BOOTSTRAP_SECRET:"test-bootstrap-secret-that-is-long-enough-32", APP_ORIGIN:"http://localhost:8787",
    ASSETS:{fetch:async()=>new Response("asset")} };
  const call=(path,options={})=>worker.fetch(new Request("http://localhost:8787"+path,options),env);
  return {DB,env,call};
}
const json = value => ({method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
const cookieFrom = response => response.headers.get("set-cookie").split(";")[0];
const parse = async response => response.json();

test("health and unauthenticated API boundaries", async () => {
  const {call}=harness();
  assert.deepEqual((await parse(await call("/api/health"))).data,{status:"ok",database:"connected"});
  assert.equal((await call("/api/v1/org-units")).status,401);
  assert.equal((await call("/api/v1/org-units",json({code:"ACME",name:"Acme",unit_type:"company"}))).status,401);
});
test("bootstrap requires secret, creates one admin and refuses a second bootstrap", async () => {
  const {call,DB}=harness();
  const body={email:"Admin@Example.com",display_name:"مدیر آزمایشی",password:"very-strong-test-password"};
  const denied=await call("/api/v1/auth/bootstrap",json(body));
  assert.equal(denied.status,403);
  const created=await call("/api/v1/auth/bootstrap",{
    ...json(body),headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  assert.equal(created.status,201);
  assert.match(created.headers.get("set-cookie"),/HttpOnly/);
  assert.match(created.headers.get("set-cookie"),/Secure/);
  assert.match(created.headers.get("set-cookie"),/SameSite=Strict/);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n,1);
  assert.notEqual(DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash,body.password);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin'").get().n,1);
  assert.equal((await call("/api/v1/auth/bootstrap",{
    ...json(body),headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  })).status,409);
  const me=await call("/api/v1/auth/me",{headers:{cookie:cookieFrom(created)}});
  assert.equal(me.status,200);
  assert.deepEqual((await parse(me)).data.roles,["admin"]);
});
test("authenticated admin can create and list organization units; duplicate code is rejected", async () => {
  const {call,DB}=harness();
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const cookie=cookieFrom(bootstrap);
  const created=await call("/api/v1/org-units",{...json({code:"acme",name:"شرکت نمونه",unit_type:"company"}),headers:{"content-type":"application/json",cookie}});
  assert.equal(created.status,201);
  const data=(await created.json()).data;
  assert.equal(data.code,"ACME");
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='org_unit.created'").get().n,1);
  const list=await call("/api/v1/org-units",{headers:{cookie}});
  assert.equal((await parse(list)).meta.count,1);
  const duplicate=await call("/api/v1/org-units",{...json({code:"ACME",name:"تکراری",unit_type:"company"}),headers:{"content-type":"application/json",cookie}});
  assert.equal(duplicate.status,409);
});
test("organization hierarchy and payload validation are enforced", async () => {
  const {call}=harness();
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const cookie=cookieFrom(bootstrap);
  const noParent=await call("/api/v1/org-units",{...json({code:"LINE1",name:"خط تولید",unit_type:"production_line"}),headers:{"content-type":"application/json",cookie}});
  assert.equal(noParent.status,400);
  const invalid=await call("/api/v1/org-units",{...json({code:"x",name:"",unit_type:"other"}),headers:{"content-type":"application/json",cookie}});
  assert.equal(invalid.status,400);
});
test("login failure is generic, successful login issues a session, logout revokes it", async () => {
  const {call}=harness();
  await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const wrong=await call("/api/v1/auth/login",json({email:"admin@example.com",password:"incorrect-password"}));
  assert.equal(wrong.status,401);
  assert.equal((await parse(wrong)).error.code,"invalid_credentials");
  const login=await call("/api/v1/auth/login",json({email:"admin@example.com",password:"strong-password-123"}));
  assert.equal(login.status,200,await login.text());
  const cookie=cookieFrom(login);
  assert.equal((await call("/api/v1/auth/me",{headers:{cookie}})).status,200);
  await call("/api/v1/auth/logout",{method:"POST",headers:{cookie}});
  assert.equal((await call("/api/v1/auth/me",{headers:{cookie}})).status,401);
});
test("rejects cross-origin requests and applies browser security headers", async () => {
  const {call}=harness();
  const denied=await call("/api/v1/auth/status",{headers:{origin:"https://attacker.example"}});
  assert.equal(denied.status,403);
  const asset=await call("/");
  assert.equal(asset.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"),true);
  assert.equal(asset.headers.get("x-frame-options"),"DENY");
});
