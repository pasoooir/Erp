import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = ["0001_erp_foundation.sql","0002_scoped_rbac.sql","0003_auth_username.sql"].map(file => fs.readFileSync(path.join(root, "migrations", file), "utf8"));
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
  assert.match(created.headers.get("set-cookie"),/SameSite=None/);
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
  const login=await call("/api/v1/auth/login",json({username:"admin",password:"strong-password-123"}));
  assert.equal(login.status,200);
  assert.equal((await parse(login)).data.username,"admin");
  const cookie=cookieFrom(login);
  assert.equal((await call("/api/v1/auth/me",{headers:{cookie}})).status,200);
  await call("/api/v1/auth/logout",{method:"POST",headers:{cookie}});
  assert.equal((await call("/api/v1/auth/me",{headers:{cookie}})).status,401);
});
test("allows the exact GitHub Pages bootstrap preflight headers", async () => {
  const response = await call("/api/v1/auth/bootstrap", {
    method: "OPTIONS",
    headers: {
      origin: "https://pasoooir.github.io",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-bootstrap-secret"
    }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://pasoooir.github.io");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-allow-headers"), /content-type/i);
  assert.match(response.headers.get("access-control-allow-headers"), /x-bootstrap-secret/i);
});

test("rejects unapproved headers in CORS preflight", async () => {
  const response = await call("/api/v1/auth/bootstrap", {
    method: "OPTIONS",
    headers: {
      origin: "https://pasoooir.github.io",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-evil-header"
    }
  });
  assert.equal(response.status, 403);
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
  DB.sqlite.prepare("INSERT INTO org_units (id,code,name,unit_type,status,created_by) VALUES (?,?,?,?,?,?)").run("unit-reader-test","OUTSIDE","Outside","company","active",userId);
  const headers={"content-type":"application/json",cookie:"erp_session="+token};
  assert.equal((await call("/api/v1/auth/me",{headers})).status,200);
  assert.equal((await call("/api/v1/org-units",{headers})).status,403);
  assert.equal((await call("/api/v1/org-units",{...json({code:"ACME",name:"Company",unit_type:"company"}),headers})).status,403);
  assert.equal((await call("/api/v1/org-units/unit-reader-test",{...json({name:"Changed"}),method:"PATCH",headers})).status,403);
  assert.equal((await call("/api/v1/org-units/unit-reader-test/deactivate",{method:"POST",headers})).status,403);
});
test("admin provisions scoped users and org managers cannot cross organization boundaries", async () => {
  const {call,DB}=harness();
  const adminBootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const adminCookie=cookieFrom(adminBootstrap);
  const createUnit=async body=>parse(await call("/api/v1/org-units",{...json(body),headers:{"content-type":"application/json",cookie:adminCookie}}));
  const companyA=(await createUnit({code:"ACME",name:"Company A",unit_type:"company"})).data;
  const siteA=(await createUnit({code:"SITEA",name:"Site A",unit_type:"site",parent_id:companyA.id})).data;
  const companyB=(await createUnit({code:"OTHER",name:"Company B",unit_type:"company"})).data;
  const siteB=(await createUnit({code:"SITEB",name:"Site B",unit_type:"site",parent_id:companyB.id})).data;

  const created=await call("/api/v1/users",{...json({
    email:"manager@example.com",display_name:"Org Manager",password:"manager-password-123",
    roles:["org_manager"],scope_ids:[companyA.id]
  }),headers:{"content-type":"application/json",cookie:adminCookie}});
  assert.equal(created.status,201,await created.clone().text());
  const manager=(await parse(created));
  assert.equal(manager.data.roles,"org_manager");
  assert.equal(manager.data.scope_count,1);
  const duplicate=await call("/api/v1/users",{...json({
    email:"MANAGER@example.com",display_name:"Duplicate",password:"manager-password-123",
    roles:["reader"],scope_ids:[companyA.id]
  }),headers:{"content-type":"application/json",cookie:adminCookie}});
  assert.equal(duplicate.status,409);
  assert.equal((await call("/api/v1/users",{headers:{cookie:adminCookie}})).status,200);

  const login=await call("/api/v1/auth/login",json({email:"manager@example.com",password:"manager-password-123"}));
  assert.equal(login.status,200);
  const managerCookie=cookieFrom(login);
  const scopedList=await call("/api/v1/org-units",{headers:{cookie:managerCookie}});
  assert.equal(scopedList.status,200);
  const visible=(await parse(scopedList)).data.map(unit=>unit.code).sort();
  assert.deepEqual(visible,["ACME","SITEA"]);
  const ownChild=await call("/api/v1/org-units",{...json({code:"DEPTA",name:"Scoped Department",unit_type:"department",parent_id:siteA.id}),headers:{"content-type":"application/json",cookie:managerCookie}});
  assert.equal(ownChild.status,201,await ownChild.clone().text());
  const outsideChild=await call("/api/v1/org-units",{...json({code:"DEPTB",name:"Outside Department",unit_type:"department",parent_id:siteB.id}),headers:{"content-type":"application/json",cookie:managerCookie}});
  assert.equal(outsideChild.status,403);
  const rootCompany=await call("/api/v1/org-units",{...json({code:"ROOT2",name:"Forbidden Root",unit_type:"company"}),headers:{"content-type":"application/json",cookie:managerCookie}});
  assert.equal(rootCompany.status,403);
  assert.equal((await call("/api/v1/org-units/"+siteB.id,{...json({name:"Outside Update"}),method:"PATCH",headers:{"content-type":"application/json",cookie:managerCookie}})).status,403);
  assert.equal((await call("/api/v1/org-units/"+siteB.id+"/deactivate",{method:"POST",headers:{cookie:managerCookie}})).status,403);
  assert.equal((await call("/api/v1/users",{headers:{cookie:managerCookie}})).status,403);

  const disabled=await call("/api/v1/users/"+manager.data.id+"/deactivate",{method:"POST",headers:{cookie:adminCookie}});
  assert.equal(disabled.status,200);
  assert.equal((await call("/api/v1/auth/me",{headers:{cookie:managerCookie}})).status,401);
  assert.equal((await call("/api/v1/users/"+(await parse(adminBootstrap)).data.id+"/deactivate",{method:"POST",headers:{cookie:adminCookie}})).status,409);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('user.created','user.deactivated')").get().n,2);
});
test("operator and reader can read their assigned subtree but cannot mutate it", async () => {
  const {call}=harness();
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"admin@example.com",display_name:"Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  const adminCookie=cookieFrom(bootstrap);
  const company=(await parse(await call("/api/v1/org-units",{...json({code:"ACME",name:"Company",unit_type:"company"}),headers:{"content-type":"application/json",cookie:adminCookie}}))).data;
  const site=(await parse(await call("/api/v1/org-units",{...json({code:"SITE1",name:"Site",unit_type:"site",parent_id:company.id}),headers:{"content-type":"application/json",cookie:adminCookie}}))).data;
  for(const role of ["operator","reader"]){
    const created=await call("/api/v1/users",{...json({
      email:role+"@example.com",display_name:role,password:"read-only-password-123",
      roles:[role],scope_ids:[company.id]
    }),headers:{"content-type":"application/json",cookie:adminCookie}});
    assert.equal(created.status,201,await created.clone().text());
    const login=await call("/api/v1/auth/login",json({email:role+"@example.com",password:"read-only-password-123"}));
    assert.equal(login.status,200);
    const cookie=cookieFrom(login);
    const list=await call("/api/v1/org-units",{headers:{cookie}});
    assert.equal(list.status,200);
    assert.deepEqual((await parse(list)).data.map(unit=>unit.code).sort(),["ACME","SITE1"]);
    assert.equal((await call("/api/v1/org-units",{...json({code:"DEPT1",name:"No write",unit_type:"department",parent_id:site.id}),headers:{"content-type":"application/json",cookie}})).status,403);
    assert.equal((await call("/api/v1/org-units/"+site.id,{...json({name:"No update"}),method:"PATCH",headers:{"content-type":"application/json",cookie}})).status,403);
    assert.equal((await call("/api/v1/org-units/"+site.id+"/deactivate",{method:"POST",headers:{cookie}})).status,403);
    assert.equal((await call("/api/v1/users",{headers:{cookie}})).status,403);
  }
});


test("audit events API is admin-only, paginated, and validates pagination", async () => {
  const {call,DB}=harness();
  assert.equal((await call("/api/v1/audit-events")).status,401);
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"audit-admin@example.com",display_name:"Audit Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  assert.equal(bootstrap.status,201);
  const cookie=cookieFrom(bootstrap);
  for(let i=0;i<3;i++) DB.sqlite.prepare(
    "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,datetime('now',?))"
  ).run("audit-test-"+i, null, "test.action."+i, "test_entity", "entity-"+i, JSON.stringify({index:i}), "+"+i+" seconds");
  const first=await call("/api/v1/audit-events?limit=2&offset=0",{headers:{cookie}});
  assert.equal(first.status,200);
  const firstBody=await parse(first);
  assert.equal(firstBody.data.length,2);
  assert.equal(firstBody.meta.has_more,true);
  assert.equal(firstBody.meta.count,2);
  assert.equal(typeof firstBody.data[0].metadata,"object");
  const second=await call("/api/v1/audit-events?limit=2&offset=2",{headers:{cookie}});
  assert.equal(second.status,200);
  assert.equal((await parse(second)).meta.has_more,false);
  assert.equal((await call("/api/v1/audit-events?limit=101",{headers:{cookie}})).status,400);
  assert.equal((await call("/api/v1/audit-events?offset=-1",{headers:{cookie}})).status,400);
  const readerId="audit-reader";
  const token="B".repeat(43);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  DB.sqlite.prepare("INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)").run(readerId,"audit-reader@example.com","Audit Reader","unused-test-hash");
  DB.sqlite.prepare("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)").run(readerId,"role-reader");
  DB.sqlite.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+1 hour'))").run(tokenHash,readerId);
  assert.equal((await call("/api/v1/audit-events",{headers:{cookie:"erp_session="+token}})).status,403);
});

test("admin can update user roles and scopes with audit and guardrails", async () => {
  const {call,DB}=harness();
  const bootstrap=await call("/api/v1/auth/bootstrap",{
    ...json({email:"access-admin@example.com",display_name:"Access Admin",password:"strong-password-123"}),
    headers:{"content-type":"application/json","x-bootstrap-secret":"test-bootstrap-secret-that-is-long-enough-32"}
  });
  assert.equal(bootstrap.status,201);
  const adminCookie=cookieFrom(bootstrap);
  const company=await call("/api/v1/org-units",{
    ...json({code:"SCOPE1",name:"محدوده اول",unit_type:"company"}),headers:{"content-type":"application/json",cookie:adminCookie}
  });
  assert.equal(company.status,201);
  const companyId=(await parse(company)).data.id;
  const created=await call("/api/v1/users",{
    ...json({email:"target@example.com",display_name:"Target",password:"target-password-123",roles:["reader"],scope_ids:[companyId]}),
    headers:{"content-type":"application/json",cookie:adminCookie}
  });
  assert.equal(created.status,201);
  const target=(await parse(created)).data;
  const updated=await call("/api/v1/users/"+target.id,{
    ...json({roles:["org_manager"],scope_ids:[companyId]}),method:"PATCH",headers:{"content-type":"application/json",cookie:adminCookie}
  });
  assert.equal(updated.status,200);
  const updatedBody=(await parse(updated)).data;
  assert.equal(updatedBody.roles,"org_manager");
  assert.equal(updatedBody.scope_count,1);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='user.access_updated' AND entity_id=?").get(target.id).n,1);
  assert.equal((await call("/api/v1/users/"+target.id,{...json({roles:["reader"],scope_ids:["missing-scope"]}),method:"PATCH",headers:{"content-type":"application/json",cookie:adminCookie}})).status,400);
  assert.equal((await call("/api/v1/users/"+target.id,{...json({roles:["admin"],scope_ids:[companyId]}),method:"PATCH",headers:{"content-type":"application/json",cookie:adminCookie}})).status,400);
  assert.equal((await call("/api/v1/users/"+target.id,{...json({roles:["reader"],scope_ids:[]}),method:"PATCH",headers:{"content-type":"application/json",cookie:adminCookie}})).status,400);
  assert.equal((await call("/api/v1/users/"+(await parse(bootstrap)).data.id,{...json({roles:["reader"],scope_ids:[companyId]}),method:"PATCH",headers:{"content-type":"application/json",cookie:adminCookie}})).status,409);
  assert.equal((await call("/api/v1/users/"+target.id,{...json({roles:["reader"],scope_ids:[companyId]}),method:"PATCH"})).status,401);
});
