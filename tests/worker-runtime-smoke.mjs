import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const wrangler=path.join(root,"node_modules","wrangler","bin","wrangler.js");
const port=8787;
const base=`http://127.0.0.1:${port}`;
const secret=process.env.BOOTSTRAP_SECRET;
if(!secret||secret.length<32)throw new Error("CI must provide a test-only BOOTSTRAP_SECRET");
const child=spawn(process.execPath,[wrangler,"dev","--local","--ip","127.0.0.1","--port",String(port)],{cwd:root,env:process.env,stdio:["ignore","pipe","pipe"]});
let output="";
child.stdout.on("data",chunk=>{output=(output+chunk.toString()).slice(-4000)});
child.stderr.on("data",chunk=>{output=(output+chunk.toString()).slice(-4000)});
async function waitForServer() {
  const deadline=Date.now()+45_000;
  while(Date.now()<deadline) {
    if(child.exitCode!==null)throw new Error("Wrangler exited before readiness: "+output);
    try {
      const response=await fetch(base+"/api/health");
      if(response.ok)return;
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error("Wrangler did not become ready: "+output);
}
async function json(pathname,options={}) {
  const response=await fetch(base+pathname,options);
  let body;
  try{body=await response.json()}catch{throw new Error("Non-JSON response for "+pathname+": "+response.status)}
  return {response,body};
}
const post=(data,headers={})=>({method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(data)});
try {
  await waitForServer();
  const health=await json("/api/health");
  assert.equal(health.body.data.database,"connected");
  const status=await json("/api/v1/auth/status");
  assert.equal(status.body.data.bootstrap_required,true);
  const denied=await json("/api/v1/auth/bootstrap",post({email:"admin@example.com",display_name:"Admin",password:"long-ci-password-123"}));
  assert.equal(denied.response.status,403);
  const bootstrap=await json("/api/v1/auth/bootstrap",post(
    {email:"admin@example.com",display_name:"Admin CI",password:"long-ci-password-123"},
    {"x-bootstrap-secret":secret}
  ));
  assert.equal(bootstrap.response.status,201,JSON.stringify(bootstrap.body));
  const cookie=bootstrap.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie&&cookie.startsWith("erp_session="));
  const me=await json("/api/v1/auth/me",{headers:{cookie}});
  assert.equal(me.response.status,200);
  assert.deepEqual(me.body.data.roles,["admin"]);
  const company=await json("/api/v1/org-units",post({code:"ACME",name:"شرکت نمونه",unit_type:"company"},{cookie}));
  assert.equal(company.response.status,201,JSON.stringify(company.body));
  const site=await json("/api/v1/org-units",post({code:"SITE1",name:"کارخانه مرکزی",unit_type:"site",parent_id:company.body.data.id},{cookie}));
  assert.equal(site.response.status,201,JSON.stringify(site.body));
  const invalidParent=await json("/api/v1/org-units",post({code:"POS1",name:"مدیر خط",unit_type:"position",parent_id:site.body.data.id},{cookie}));
  assert.equal(invalidParent.response.status,400);
  const duplicate=await json("/api/v1/org-units",post({code:"ACME",name:"تکراری",unit_type:"company"},{cookie}));
  assert.equal(duplicate.response.status,409);
  const list=await json("/api/v1/org-units",{headers:{cookie}});
  assert.equal(list.response.status,200);
  assert.equal(list.body.meta.count,2);
  const logout=await json("/api/v1/auth/logout",{method:"POST",headers:{cookie}});
  assert.equal(logout.response.status,200);
  const afterLogout=await json("/api/v1/auth/me",{headers:{cookie}});
  assert.equal(afterLogout.response.status,401);
  console.log("Worker runtime smoke passed: health, D1 migration, bootstrap, session, hierarchy, uniqueness and logout.");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  child.kill("SIGTERM");
  await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once("exit",resolve);setTimeout(()=>{child.kill("SIGKILL");resolve()},3000).unref();});
}
