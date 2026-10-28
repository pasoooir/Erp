import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = ["0001_erp_foundation.sql","0002_scoped_rbac.sql"].map(file => fs.readFileSync(path.join(root, "migrations", file), "utf8"));
class Statement {
  constructor(db, sql, values = []) { this.db=db; this.sql=sql; this.values=values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values), success: true }; }
  async run() { const result=this.db.prepare(this.sql).run(...this.values); return { success:true, meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid||0)} }; }
}
class TestD1 {
  constructor() { this.sqlite=new DatabaseSync(":memory:"); this.sqlite.exec("PRAGMA foreign_keys = ON"); for (const migration of migrations) this.sqlite.exec(migration); this.batchQueue=Promise.resolve(); }
  prepare(sql) { return new Statement(this.sqlite,sql); }
  async batch(statements) {
    const previous=this.batchQueue;
    let release;
    this.batchQueue=new Promise(resolve=>{release=resolve;});
    await previous;
    try {
      this.sqlite.exec("BEGIN");
      try {
        const results=[];
        for (const statement of statements) results.push(await statement.run());
        this.sqlite.exec("COMMIT");
        return results;
      } catch(error) { this.sqlite.exec("ROLLBACK"); throw error; }
    } finally { release(); }
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
test("rejects oversized JSON bodies and rate-limits repeated login failures", async () => {
  const {call}=harness();
  const oversized=await call("/api/v1/auth/login",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email:"nobody@example.com",password:"x",padding:"x".repeat(18_000)})
  });
  assert.equal(oversized.status,400);
  assert.equal((await parse(oversized)).error.code,"request_too_large");
  for(let i=0;i<10;i++) {
    const attempt=await call("/api/v1/auth/login",json({email:"nobody@example.com",password:"incorrect-password"}));
    assert.equal(attempt.status,401);
  }
  const limited=await call("/api/v1/auth/login",json({email:"nobody@example.com",password:"incorrect-password"}));
  assert.equal(limited.status,429);
});
test("concurrent bootstrap requests can create at most one first administrator", async () => {
  const {call,DB}=harness();
  const headers={"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"};
  const body={email:"admin@example.com",display_name:"Admin",password:"strong-password-123"};
  const [a,b]=await Promise.all([
    call("/api/v1/auth/bootstrap",{...json(body),headers}),
    call("/api/v1/auth/bootstrap",{...json(body),headers})
  ]);
  assert.deepEqual([a.status,b.status].sort(),[201,409]);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n,1);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin'").get().n,1);
});
test("admin can edit organization units and enforce hierarchy-aware activation lifecycle", async () => {
  const {call,DB}=harness();
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const cookie=cookieFrom(bootstrap);
  const companyResponse=await call("/api/v1/org-units",{...json({code:"ACME",name:"Company",unit_type:"company"}),headers:{"content-type":"application/json",cookie}});
  const company=(await parse(companyResponse)).data;
  const siteResponse=await call("/api/v1/org-units",{...json({code:"SITE1",name:"Site",unit_type:"site",parent_id:company.id}),headers:{"content-type":"application/json",cookie}});
  const site=(await parse(siteResponse)).data;
  const deptResponse=await call("/api/v1/org-units",{...json({code:"DEPT1",name:"Department 1",unit_type:"department",parent_id:site.id}),headers:{"content-type":"application/json",cookie}});
  const dept=(await parse(deptResponse)).data;
  const childResponse=await call("/api/v1/org-units",{...json({code:"DEPT2",name:"Department 2",unit_type:"department",parent_id:dept.id}),headers:{"content-type":"application/json",cookie}});
  const child=(await parse(childResponse)).data;

  const updated=await call("/api/v1/org-units/"+dept.id,{...json({name:"Department Updated",parent_id:site.id}),method:"PATCH",headers:{"content-type":"application/json",cookie}});
  assert.equal(updated.status,200,await updated.clone().text());
  assert.equal((await parse(updated)).data.name,"Department Updated");
  const cycle=await call("/api/v1/org-units/"+dept.id,{...json({parent_id:child.id}),method:"PATCH",headers:{"content-type":"application/json",cookie}});
  assert.equal(cycle.status,400);
  assert.equal((await parse(cycle)).error.code,"hierarchy_cycle");
  const unknownField=await call("/api/v1/org-units/"+dept.id,{...json({status:"inactive"}),method:"PATCH",headers:{"content-type":"application/json",cookie}});
  assert.equal(unknownField.status,400);

  assert.equal((await call("/api/v1/org-units/"+company.id+"/deactivate",{method:"POST",headers:{cookie}})).status,409);
  assert.equal((await call("/api/v1/org-units/"+dept.id+"/deactivate",{method:"POST",headers:{cookie}})).status,409);
  assert.equal((await call("/api/v1/org-units/"+child.id+"/deactivate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+dept.id+"/deactivate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+site.id+"/deactivate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+company.id+"/deactivate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+child.id+"/activate",{method:"POST",headers:{cookie}})).status,409);
  assert.equal((await call("/api/v1/org-units/"+site.id+"/activate",{method:"POST",headers:{cookie}})).status,409);
  assert.equal((await call("/api/v1/org-units/"+company.id+"/activate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+site.id+"/activate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+dept.id+"/activate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal((await call("/api/v1/org-units/"+child.id+"/activate",{method:"POST",headers:{cookie}})).status,200);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('org_unit.updated','org_unit.activated','org_unit.deactivated')").get().n,9);
});
test("organization lifecycle endpoints still require a session and admin role", async () => {
  const {call}=harness();
  const noSession=await call("/api/v1/org-units/not-a-real-id/deactivate",{method:"POST"});
  assert.equal(noSession.status,401);
});
test("authenticated non-admin users cannot read or mutate organization data", async () => {
  const {call,DB}=harness();
  const userId="reader-user";
  const roleId="role-reader";
  const token="A".repeat(43);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  DB.sqlite.prepare("INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)").run(userId,"reader@example.com","Reader","unused-test-hash");
  DB.sqlite.prepare("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)").run(userId,roleId);
  DB.sqlite.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+1 hour'))").run(tokenHash,userId);
  const headers={cookie:"erp_session="+token};
  assert.equal((await call("/api/v1/auth/me",{headers})).status,200);
  assert.equal((await call("/api/v1/org-units",{headers})).status,403);
  assert.equal((await call("/api/v1/org-units",{...json({code:"ACME",name:"Company",unit_type:"company"}),headers})).status,403);
  assert.equal((await call("/api/v1/org-units/fake-id",{...json({name:"Changed"}),method:"PATCH",headers})).status,403);
  assert.equal((await call("/api/v1/org-units/fake-id/deactivate",{method:"POST",headers})).status,403);
});
