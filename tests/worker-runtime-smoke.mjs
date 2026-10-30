import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const wrangler=path.join(root,"node_modules","wrangler","bin","wrangler.js");
const port=8787;
const base=`http://localhost:${port}`;
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
    try { const response=await fetch(base+"/api/health"); if(response.ok)return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error("Wrangler did not become ready: "+output);
}
async function api(pathname,options={}) {
  const response=await fetch(base+pathname,options);
  let body;
  try{body=await response.json()}catch{throw new Error("Non-JSON response for "+pathname+": "+response.status)}
  return {response,body};
}
const post=(data,headers={})=>({method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(data)});
const password="long-ci-password-123";
let browser;
try {
  await waitForServer();
  const health=await api("/api/health");
  assert.equal(health.body.data.database,"connected");
  const status=await api("/api/v1/auth/status");
  assert.equal(status.body.data.bootstrap_required,true);

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
  const browserDiagnostics=[];
  page.on("console",message=>browserDiagnostics.push("console:"+message.type()+":"+message.text()));
  page.on("requestfailed",request=>browserDiagnostics.push("requestfailed:"+request.url()+":"+request.failure()?.errorText));
  page.on("response",response=>{if(response.url().includes("/api/v1/auth/passkey/"))browserDiagnostics.push("response:"+response.status()+":"+response.url());});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true}});
  await page.goto(base+"/");
  await page.locator("#bootstrapForm").waitFor({state:"visible"});
  await page.locator('input[name="bootstrap_secret"]').fill(secret);
  await page.locator('#bootstrapForm input[name="display_name"]').fill("مدیر آزمایش");
  await page.locator('#bootstrapForm input[name="username"]').fill("admin");
  await page.locator('#bootstrapForm input[name="email"]').fill("admin@example.com");
  await page.locator("#bootstrapForm button[type=submit]").click();
  await page.waitForFunction(() => {
    const app=document.querySelector("#appPanel"),notice=document.querySelector("#notice");
    return (app&&!app.classList.contains("hidden")) || (notice&&notice.classList.contains("error"));
  },null,{timeout:30000});
  if(await page.locator("#appPanel").isHidden()) throw new Error("Passkey bootstrap failed: "+await page.locator("#notice").innerText()+"\\nBrowser diagnostics: "+browserDiagnostics.join(" | ")+"\\nPage errors: "+pageErrors.join(" | ")+"\\nWorker output: "+output);

  assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
  assert.equal(await page.locator("html").getAttribute("lang"),"fa");
  await page.locator("#logoutButton").click();
  await page.locator("#loginForm").waitFor({state:"visible"});
  await page.locator('#loginForm input[name="identifier"]').fill("admin");
  await page.locator("#passkeyLoginButton").click();
  await page.locator("#appPanel").waitFor({state:"visible"});
  await page.locator("#unitForm input[name=code]").fill("ACME");
  await page.locator("#unitForm input[name=name]").fill("شرکت نمونه");
  await page.locator("#unitForm select[name=unit_type]").selectOption("company");
  await page.locator("#unitForm button[type=submit]").click();
  await page.locator("#unitsTable tr").filter({hasText:"ACME"}).waitFor();
  const parentSelect=page.locator("#unitForm select[name=parent_id]");
  const options=await parentSelect.locator("option").evaluateAll(items=>items.map(option=>({value:option.value,text:option.textContent||""})));
  const companyOption=options.find(option=>option.value&&option.text.includes("ACME"));
  assert.ok(companyOption,"Company should be selectable as a parent");
  await page.locator("#unitForm input[name=code]").fill("SITE1");
  await page.locator("#unitForm input[name=name]").fill("کارخانه مرکزی");
  await page.locator("#unitForm select[name=unit_type]").selectOption("site");
  await parentSelect.selectOption(companyOption.value);
  await page.locator("#unitForm button[type=submit]").click();
  await page.locator("#unitsTable tr").filter({hasText:"SITE1"}).waitFor();
  assert.equal(await page.locator("#unitsTable tr").count(),2);
  let siteRow=page.locator("#unitsTable tr").filter({hasText:"SITE1"});
  await siteRow.locator('button[data-action="edit"]').click();
  await page.locator("#editPanel").waitFor({state:"visible"});
  await page.locator('#editUnitForm input[name="name"]').fill("کارخانه مرکزی ویرایش‌شده");
  await page.locator('#editUnitForm button[type="submit"]').click();
  await page.locator("#unitsTable tr").filter({hasText:"کارخانه مرکزی ویرایش‌شده"}).waitFor();
  siteRow=page.locator("#unitsTable tr").filter({hasText:"SITE1"});
  await siteRow.locator('button[data-action="status"]').click();
  await siteRow.locator("td").nth(4).getByText("غیرفعال").waitFor();
  siteRow=page.locator("#unitsTable tr").filter({hasText:"SITE1"});
  await siteRow.locator('button[data-action="status"]').click();
  await siteRow.locator("td").nth(4).getByText("فعال").waitFor();

  await page.locator("#unitForm input[name=code]").fill("OTHER");
  await page.locator("#unitForm input[name=name]").fill("شرکت دوم");
  await page.locator("#unitForm select[name=unit_type]").selectOption("company");
  await page.locator("#unitForm button[type=submit]").click();
  await page.locator("#unitsTable tr").filter({hasText:"OTHER"}).waitFor();
  const otherOptions=await parentSelect.locator("option").evaluateAll(items=>items.map(option=>({value:option.value,text:option.textContent||""})));
  const otherOption=otherOptions.find(option=>option.value&&option.text.includes("OTHER"));
  assert.ok(otherOption,"Second company should be selectable");
  await page.locator("#unitForm input[name=code]").fill("SITEB");
  await page.locator("#unitForm input[name=name]").fill("کارخانه دوم");
  await page.locator("#unitForm select[name=unit_type]").selectOption("site");
  await parentSelect.selectOption(otherOption.value);
  await page.locator("#unitForm button[type=submit]").click();
  await page.locator("#unitsTable tr").filter({hasText:"SITEB"}).waitFor();
  assert.equal(await page.locator("#unitsTable tr").count(),4);

  await page.locator('#userForm input[name="display_name"]').fill("مدیر شرکت اول");
  await page.locator('#userForm input[name="username"]').fill("manager");
  await page.locator('#userForm input[name="email"]').fill("manager@example.com");
  await page.locator('#userForm input[name="password"]').fill("manager-password-123");
  await page.locator('#userForm select[name="role"]').selectOption("org_manager");
  const scopeOptions=await page.locator('#userForm select[name="scope_ids"] option').evaluateAll(items=>items.map(option=>({value:option.value,text:option.textContent||""})));
  const scopeOption=scopeOptions.find(option=>option.value&&option.text.includes("ACME"));
  assert.ok(scopeOption,"Company A should be selectable as a user scope");
  await page.locator('#userForm select[name="scope_ids"]').selectOption(scopeOption.value);
  await page.locator("#userForm button[type=submit]").click();
  try { await page.locator("#usersTable tr").filter({hasText:"manager@example.com"}).waitFor({timeout:8000}); }
  catch { throw new Error("Scoped user creation failed in UI: "+await page.locator("#notice").textContent()); }
  await page.locator("#usersTable tr").filter({hasText:"manager@example.com"}).getByText(/ACME/).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"mobile page should not overflow horizontally");
  assert.deepEqual(pageErrors,[]);

  const badSecret=await api("/api/v1/auth/bootstrap",post(
    {email:"second@example.com",display_name:"Second",password},
    {"x-bootstrap-secret":"wrong-secret"}
  ));
  assert.equal(badSecret.response.status,403);
  const secondBootstrap=await api("/api/v1/auth/bootstrap",post(
    {email:"second@example.com",display_name:"Second",password},
    {"x-bootstrap-secret":secret}
  ));
  assert.equal(secondBootstrap.response.status,409);

  const browserCookies=await page.context().cookies(base+"/api/");
  const sessionCookie=browserCookies.find(item=>item.name==="erp_session");
  const cookie=sessionCookie?sessionCookie.name+"="+sessionCookie.value:"";
  assert.ok(cookie&&cookie.startsWith("erp_session="),"Passkey login should issue a session cookie");
  const me=await api("/api/v1/auth/me",{headers:{cookie}});
  assert.deepEqual(me.body.data.roles,["admin"]);
  const listed=await api("/api/v1/org-units",{headers:{cookie}});
  assert.equal(listed.body.meta.count,4);
  const invalidParent=await api("/api/v1/org-units",post({code:"POS1",name:"سمت آزمایشی",unit_type:"position",parent_id:listed.body.data.find(row=>row.code==="SITE1").id},{cookie}));
  assert.equal(invalidParent.response.status,400);
  const duplicate=await api("/api/v1/org-units",post({code:"ACME",name:"تکراری",unit_type:"company"},{cookie}));
  assert.equal(duplicate.response.status,409);

  const managerLogin=await api("/api/v1/auth/login",post({email:"manager@example.com",password:"manager-password-123"}));
  assert.equal(managerLogin.response.status,200);
  const managerCookie=managerLogin.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(managerCookie);
  const scoped=await api("/api/v1/org-units",{headers:{cookie:managerCookie}});
  assert.deepEqual(scoped.body.data.map(unit=>unit.code).sort(),["ACME","SITE1"]);
  const ownChild=await api("/api/v1/org-units",post({code:"DEPT1",name:"واحد اول",unit_type:"department",parent_id:listed.body.data.find(unit=>unit.code==="SITE1").id},{cookie:managerCookie}));
  assert.equal(ownChild.response.status,201);
  const outsideChild=await api("/api/v1/org-units",post({code:"DEPT2",name:"واحد خارج از محدوده",unit_type:"department",parent_id:listed.body.data.find(unit=>unit.code==="SITEB").id},{cookie:managerCookie}));
  assert.equal(outsideChild.response.status,403);
  assert.equal((await api("/api/v1/org-units",post({code:"ROOT2",name:"شرکت غیرمجاز",unit_type:"company"},{cookie:managerCookie}))).response.status,403);
  assert.equal((await api("/api/v1/org-units/"+listed.body.data.find(unit=>unit.code==="SITEB").id,{...post({name:"تغییر خارج از محدوده"}),method:"PATCH",headers:{cookie:managerCookie,"content-type":"application/json"}})).response.status,403);
  assert.equal((await api("/api/v1/users",{headers:{cookie:managerCookie}})).response.status,403);

  await api("/api/v1/auth/logout",{method:"POST",headers:{cookie}});
  assert.equal((await api("/api/v1/auth/me",{headers:{cookie}})).response.status,401);
  const managerRow=page.locator("#usersTable tr").filter({hasText:"manager@example.com"});
  await managerRow.locator('button[data-action="user-status"]').click();
  await managerRow.locator("td").nth(5).getByText("غیرفعال").waitFor();
  assert.equal((await api("/api/v1/auth/me",{headers:{cookie:managerCookie}})).response.status,401);

  await page.locator("#logoutButton").click();
  await page.locator("#loginForm").waitFor({state:"visible"});
  await page.locator('#loginForm input[name="identifier"]').fill("admin");
  await page.locator('#loginForm input[name="password"]').fill(password);
  await page.locator("#loginForm button[type=submit]").click();
  await page.locator("#appPanel").waitFor({state:"visible"});
  await page.locator("#auditPanel").waitFor({state:"visible"});
  const auditProbe=await page.evaluate(async()=>{const response=await fetch("/api/v1/audit-events?limit=50&offset=0");return {status:response.status,body:await response.json()};});
  assert.equal(auditProbe.status,200,"audit API should be available after login; notice="+await page.locator("#notice").textContent());
  assert.ok(auditProbe.body.data.length>0,"audit API should return persisted events");
  await page.locator("#auditTable tr").first().waitFor();
  assert.ok(await page.locator("#auditTable tr").count()>0,"admin should see persisted audit events");
  assert.equal(await page.locator("#moreAuditButton").isVisible(),false,"pagination button should hide when there is no next page");
  assert.deepEqual(pageErrors,[]);
  console.log("Worker + Chromium smoke passed: D1 migration, bootstrap, login/logout, sessions, role checks, org hierarchy, audit API/UI, RTL and mobile layout.");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once("exit",resolve);setTimeout(()=>{child.kill("SIGKILL");resolve()},3000).unref();});
}
