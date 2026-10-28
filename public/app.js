(() => {
  const $ = id => document.getElementById(id);
  const forms = { bootstrap: $("bootstrapForm"), login: $("loginForm"), unit: $("unitForm") };
  let currentUser = null, units = [];
  const labels = { company: "شرکت", site: "سایت / کارخانه", department: "واحد سازمانی", position: "سمت", production_line: "خط تولید", warehouse: "انبار" };
  function notice(message, kind = "") { const el=$("notice"); el.textContent=message; el.className="notice"+(kind?" "+kind:""); }
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials:"same-origin", ...options, headers: { ...(options.body ? {"content-type":"application/json"} : {}), ...(options.headers||{}) } });
    let payload; try { payload=await response.json(); } catch { throw new Error("پاسخ معتبر از سرور دریافت نشد."); }
    if (!response.ok) throw new Error(payload?.error?.message || "درخواست ناموفق بود.");
    return payload.data;
  }
  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
  function showAuth(bootstrapRequired) {
    $("appPanel").classList.add("hidden"); $("authPanel").classList.remove("hidden"); $("logoutButton").classList.add("hidden");
    $("bootstrapForm").classList.toggle("hidden",!bootstrapRequired); $("loginForm").classList.toggle("hidden",bootstrapRequired);
    $("authTitle").textContent=bootstrapRequired?"راه‌اندازی امن اولیه":"ورود به سامانه";
    $("authDescription").textContent=bootstrapRequired?"نخستین مدیر را فقط یک بار بسازید. کلید راه‌اندازی باید در تنظیمات امن Worker باشد.":"با حساب فعال خود وارد شوید.";
  }
  function showApp(user) {
    currentUser=user; $("authPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); $("logoutButton").classList.remove("hidden");
    $("welcomeTitle").textContent="سلام، "+user.display_name; $("welcomeText").textContent="نقش‌ها: "+user.roles.join("، ");
    $("createPanel").classList.toggle("hidden",!user.roles.includes("admin"));
  }
  function fillParents() {
    const select=forms.unit.elements.parent_id; const old=select.value;
    select.replaceChildren(new Option("بدون والد (فقط شرکت)",""));
    units.filter(u=>u.status==="active").forEach(u=>select.add(new Option(u.code+" — "+u.name,u.id)));
    if (units.some(u=>u.id===old)) select.value=old;
  }
  function renderUnits() {
    $("unitCount").textContent=new Intl.NumberFormat("fa-IR").format(units.length);
    $("unitsLoading").classList.add("hidden"); $("unitsEmpty").classList.toggle("hidden",units.length>0);
    const body=$("unitsTable"); body.replaceChildren();
    for (const unit of units) {
      const tr=document.createElement("tr");
      for (const value of [unit.code,unit.name,labels[unit.unit_type]||unit.unit_type,unit.parent_name||"—",unit.status==="active"?"فعال":"غیرفعال"]) {
        const td=document.createElement("td"); td.textContent=value; tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    fillParents();
  }
  async function loadUnits() {
    $("unitsLoading").classList.remove("hidden");
    try { const result=await api("/api/v1/org-units"); units=result; renderUnits(); }
    catch(e) { if(e.message.includes("وارد سامانه")) { await refreshAuth(); return; } notice(e.message,"error"); $("unitsLoading").classList.add("hidden"); }
  }
  async function refreshAuth() {
    try { const user=await api("/api/v1/auth/me"); showApp(user); notice("ورود موفق بود؛ داده‌ها از D1 خوانده می‌شوند.","success"); await loadUnits(); }
    catch { currentUser=null; const status=await api("/api/v1/auth/status"); showAuth(status.bootstrap_required); notice(status.bootstrap_required?"پایگاه داده آماده ساخت نخستین مدیر است.":"برای ادامه وارد سامانه شوید."); }
  }
  forms.bootstrap.addEventListener("submit",async event=>{
    event.preventDefault(); const submit=forms.bootstrap.querySelector("button"); submit.disabled=true;
    const data=formData(forms.bootstrap); const secret=data.bootstrap_secret; delete data.bootstrap_secret;
    try {
      await api("/api/v1/auth/bootstrap",{method:"POST",headers:{"x-bootstrap-secret":secret},body:JSON.stringify(data)});
      forms.bootstrap.reset(); notice("مدیر اولیه ایجاد شد.","success"); await refreshAuth();
    } catch(e) { notice(e.message,"error"); } finally { submit.disabled=false; }
  });
  forms.login.addEventListener("submit",async event=>{
    event.preventDefault(); const submit=forms.login.querySelector("button"); submit.disabled=true;
    try { await api("/api/v1/auth/login",{method:"POST",body:JSON.stringify(formData(forms.login))}); forms.login.reset(); await refreshAuth(); }
    catch(e) { notice(e.message,"error"); } finally { submit.disabled=false; }
  });
  forms.unit.addEventListener("submit",async event=>{
    event.preventDefault(); const submit=forms.unit.querySelector("button"); submit.disabled=true;
    const data=formData(forms.unit); if(!data.parent_id) data.parent_id=null;
    try { await api("/api/v1/org-units",{method:"POST",body:JSON.stringify(data)}); forms.unit.reset(); notice("واحد سازمانی ثبت شد و رویداد ممیزی ذخیره شد.","success"); await loadUnits(); }
    catch(e) { notice(e.message,"error"); } finally { submit.disabled=false; }
  });
  $("logoutButton").addEventListener("click",async()=>{
    try { await api("/api/v1/auth/logout",{method:"POST"}); currentUser=null; showAuth(false); notice("از سامانه خارج شدید.","success"); }
    catch(e) { notice(e.message,"error"); }
  });
  refreshAuth().catch(()=>notice("ارتباط با API برقرار نشد. وضعیت Worker و اتصال D1 را بررسی کنید.","error"));
})();
