(async () => {
  const scriptUrl = document.currentScript?.src || new URL("./modules/erp-shell/erp-shell.js", location.href).href;
  const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) ? location.origin : "https://erp-api.pasoooir-erp.workers.dev";
  const $ = id => document.getElementById(id);
  const authMount = $("authFormMount");
  const authFragmentResponse = await fetch(new URL("../auth/login/login-form.html", scriptUrl), { credentials: "same-origin" });
  if (!authFragmentResponse.ok) throw new Error("فرم ورود بارگذاری نشد؛ مسیر ماژول احراز هویت را بررسی کنید.");
  authMount.innerHTML = await authFragmentResponse.text();
  const loginModule = await import(new URL("../auth/login/login-form.js", scriptUrl));
  loginModule.initializeLoginForm();
  const forms = { bootstrap:$("bootstrapForm"), login:$("loginForm"), unit:$("unitForm"), edit:$("editUnitForm"), users:$("userForm"), access:$("userAccessForm") };
  let currentUser=null, units=[], users=[], auditEvents=[], auditOffset=0, auditHasMore=false, editingAccessUserId=null;
  const labels={company:"شرکت",site:"سایت / کارخانه",department:"واحد سازمانی",position:"سمت",production_line:"خط تولید",warehouse:"انبار"};
  const roleLabels={admin:"مدیر سراسری",org_manager:"مدیر واحد سازمانی",operator:"اپراتور",reader:"مشاهده‌گر"};
  function notice(message,kind=""){const el=$("notice");el.textContent=message;el.className="notice"+(kind?" "+kind:"");}
  async function api(path,options={},includeMeta=false){
    const response=await fetch(new URL(path,API_BASE),{credentials:"include",...options,headers:{...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})}});
    let payload;try{payload=await response.json();}catch{throw new Error("پاسخ معتبر از سرور دریافت نشد.");}
    if(!response.ok)throw new Error(payload?.error?.message||"درخواست ناموفق بود.");
    return includeMeta?payload:payload.data;
  }
  const formData=form=>Object.fromEntries(new FormData(form).entries());
  function syncUserScopeRequirement(){
    const isAdmin=forms.users.elements.role.value==="admin",select=forms.users.elements.scope_ids;
    select.required=!isAdmin;select.disabled=isAdmin;
    if(isAdmin)Array.from(select.options).forEach(option=>{option.selected=false;});
  }
  function showAuth(bootstrapRequired){
    $("appPanel").classList.add("hidden");$("authPanel").classList.remove("hidden");$("logoutButton").classList.add("hidden");
    $("bootstrapForm").classList.toggle("hidden",!bootstrapRequired);$("loginForm").classList.toggle("hidden",bootstrapRequired);
    $("authTitle").textContent=bootstrapRequired?"راه‌اندازی امن اولیه":"ورود به سامانه";
    $("authDescription").textContent=bootstrapRequired?"نخستین مدیر را فقط یک بار بسازید. کلید راه‌اندازی باید در تنظیمات امن Worker باشد.":"با حساب فعال خود وارد شوید.";
  }
  function showApp(user){
    currentUser=user;$("authPanel").classList.add("hidden");$("appPanel").classList.remove("hidden");$("logoutButton").classList.remove("hidden");
    $("welcomeTitle").textContent="سلام، "+user.display_name;$("welcomeText").textContent="نقش‌ها: "+user.roles.map(role=>roleLabels[role]||role).join("، ");
    const isAdmin=user.roles.includes("admin"),canManage=isAdmin||user.roles.includes("org_manager");
    const companyOption=Array.from(forms.unit.elements.unit_type.options).find(option=>option.value==="company");
    if(companyOption){companyOption.disabled=!isAdmin;companyOption.hidden=!isAdmin;}
    if(!isAdmin&&forms.unit.elements.unit_type.value==="company")forms.unit.elements.unit_type.value="site";
    $("createPanel").classList.toggle("hidden",!canManage);
    $("editPanel").classList.toggle("hidden",!canManage||!forms.edit.elements.id.value);
    $("usersPanel").classList.toggle("hidden",!isAdmin);
    $("auditPanel").classList.toggle("hidden",!isAdmin);
    syncUserScopeRequirement();
  }
  function populateParentSelect(select,oldValue,excludeId=null){
    select.replaceChildren(new Option("بدون والد (فقط شرکت)",""));
    units.filter(unit=>unit.status==="active"&&unit.id!==excludeId).forEach(unit=>select.add(new Option(unit.code+" — "+unit.name,unit.id)));
    if(units.some(unit=>unit.id===oldValue&&unit.status==="active"&&unit.id!==excludeId))select.value=oldValue;
  }
  function fillUserScopes(){
    const select=forms.users.elements.scope_ids,selected=new Set(Array.from(select.selectedOptions).map(option=>option.value));
    select.replaceChildren();
    units.filter(unit=>unit.status==="active").forEach(unit=>{const option=new Option(unit.code+" — "+unit.name,unit.id);option.selected=selected.has(unit.id);select.add(option);});
    syncUserScopeRequirement();
  }
  function fillParents(){
    populateParentSelect(forms.unit.elements.parent_id,forms.unit.elements.parent_id.value);
    populateParentSelect(forms.edit.elements.parent_id,forms.edit.elements.parent_id.value,forms.edit.elements.id.value||null);
    fillUserScopes();
  }
  function startEdit(unit){
    forms.edit.elements.id.value=unit.id;forms.edit.elements.code.value=unit.code;forms.edit.elements.name.value=unit.name;
    populateParentSelect(forms.edit.elements.parent_id,unit.parent_id||"",unit.id);forms.edit.elements.parent_id.value=unit.parent_id||"";
    $("editPanel").classList.remove("hidden");forms.edit.elements.name.focus();$("editPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function cancelEdit(){forms.edit.reset();$("editPanel").classList.add("hidden");}
  function renderUnits(){
    $("unitCount").textContent=new Intl.NumberFormat("fa-IR").format(units.length);
    $("unitsLoading").classList.add("hidden");$("unitsEmpty").classList.toggle("hidden",units.length>0);
    const body=$("unitsTable");body.replaceChildren();
    for(const unit of units){
      const tr=document.createElement("tr");
      for(const value of [unit.code,unit.name,labels[unit.unit_type]||unit.unit_type,unit.parent_name||"—",unit.status==="active"?"فعال":"غیرفعال"]){
        const td=document.createElement("td");td.textContent=value;tr.appendChild(td);
      }
      const actions=document.createElement("td");actions.className="table-actions";
      if(currentUser?.roles.some(role=>["admin","org_manager"].includes(role))){
        if(unit.status==="active"){
          const edit=document.createElement("button");edit.type="button";edit.className="button small";edit.dataset.action="edit";edit.dataset.id=unit.id;edit.setAttribute("aria-label","ویرایش "+unit.code);edit.textContent="ویرایش";actions.appendChild(edit);
        }
        const status=document.createElement("button");status.type="button";status.className="button small secondary";status.dataset.action="status";status.dataset.id=unit.id;status.dataset.next=unit.status==="active"?"deactivate":"activate";status.setAttribute("aria-label",(unit.status==="active"?"غیرفعال‌سازی ":"فعال‌سازی ")+unit.code);status.textContent=unit.status==="active"?"غیرفعال‌سازی":"فعال‌سازی";actions.appendChild(status);
      }else{actions.textContent="—";}
      tr.appendChild(actions);body.appendChild(tr);
    }
    fillParents();
  }
  async function loadUnits(){
    $("unitsLoading").classList.remove("hidden");
    try{units=await api("/api/v1/org-units");renderUnits();}
    catch(e){if(e.message.includes("وارد سامانه")){await refreshAuth();return;}notice(e.message,"error");$("unitsLoading").classList.add("hidden");}
  }
  function renderUsers(){
    const body=$("usersTable");body.replaceChildren();
    for(const user of users){
      const tr=document.createElement("tr");
      for(const value of [user.display_name,String(user.username||"—"),user.email,String(user.roles||"").split(",").map(role=>roleLabels[role]||role).join("، ")||"—",(user.scopes||(String(user.roles||"").split(",").includes("admin")?"سراسری":"—")),user.status==="active"?"فعال":"غیرفعال"]){
        const td=document.createElement("td");td.textContent=value;tr.appendChild(td);
      }
      const actions=document.createElement("td");actions.className="table-actions";
      if(user.id!==currentUser?.id){
        const edit=document.createElement("button");edit.type="button";edit.className="button small";edit.dataset.action="user-access-edit";edit.dataset.id=user.id;edit.textContent="ویرایش دسترسی";actions.appendChild(edit);
        const button=document.createElement("button");button.type="button";button.className="button small secondary";button.dataset.action="user-status";button.dataset.id=user.id;button.dataset.next=user.status==="active"?"deactivate":"activate";button.textContent=user.status==="active"?"غیرفعال‌سازی":"فعال‌سازی";actions.appendChild(button);
      }else{actions.textContent="حساب فعلی";}
      tr.appendChild(actions);body.appendChild(tr);
    }
  }
  function startEditUserAccess(user){
    editingAccessUserId=user.id;$("userAccessPanel").classList.remove("hidden");$("accessUserTitle").textContent="ویرایش دسترسی: "+user.display_name;
    forms.access.elements.id.value=user.id;forms.access.elements.role.value=String(user.roles||"").split(",")[0]||"reader";
    const selected=new Set(Array.isArray(user.scope_ids)?user.scope_ids.map(String):[]);const scopeText=String(user.scopes||"");const select=forms.access.elements.scope_ids;select.replaceChildren();
    units.filter(unit=>unit.status==="active").forEach(unit=>{const option=new Option(unit.code+" — "+unit.name,unit.id);option.selected=selected.has(unit.id)||scopeText.includes(unit.code+" — "+unit.name);select.add(option);});
    syncAccessScopeRequirement();$("userAccessPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function syncAccessScopeRequirement(){const isAdmin=forms.access.elements.role.value==="admin";const select=forms.access.elements.scope_ids;select.required=!isAdmin;select.disabled=isAdmin;if(isAdmin)Array.from(select.options).forEach(option=>option.selected=false);}
  function cancelUserAccessEdit(){editingAccessUserId=null;forms.access.reset();$("userAccessPanel").classList.add("hidden");}

  async function loadUsers(){
    if(!currentUser?.roles.includes("admin"))return;
    try{users=await api("/api/v1/users");renderUsers();}
    catch(e){notice(e.message,"error");}
  }
  function renderAudit(){
    const body=$("auditTable");body.replaceChildren();
    $("auditEmpty").classList.toggle("hidden",auditEvents.length>0);
    for(const event of auditEvents){
      const tr=document.createElement("tr");
      const metadata=JSON.stringify(event.metadata||{});
      const values=[event.created_at||"—",event.actor_email||"سیستم",event.action||"—",event.entity_type||"—",event.entity_id||"—",metadata.length>240?metadata.slice(0,237)+"…":metadata];
      for(const value of values){const td=document.createElement("td");td.textContent=value;tr.appendChild(td);}
      body.appendChild(tr);
    }
    $("moreAuditButton").disabled=!auditHasMore;
    $("moreAuditButton").classList.toggle("hidden",!auditHasMore);
  }
  async function loadAudit(reset=false){
    if(!currentUser?.roles.includes("admin"))return;
    const button=$("refreshAuditButton");button.disabled=true;
    if(reset){auditEvents=[];auditOffset=0;renderAudit();}
    try{
      const response=await api("/api/v1/audit-events?limit=50&offset="+auditOffset,{},true);
      const page=response.data||[];auditHasMore=Boolean(response.meta?.has_more);
      auditEvents=reset?page:auditEvents.concat(page);auditOffset+=page.length;renderAudit();
      if(reset&&page.length===0)notice("گزارش ممیزی هنوز رویدادی ندارد.","success");
    }catch(e){notice(e.message,"error");}
    finally{button.disabled=false;}
  }
  async function refreshAuth(){
    try{
      const user=await api("/api/v1/auth/me");showApp(user);notice("ورود موفق بود؛ داده‌ها از D1 خوانده می‌شوند.","success");
      await loadUnits();if(user.roles.includes("admin")){await loadUsers();await loadAudit(true);}
    }catch{
      currentUser=null;cancelEdit();
      try{
        const status=await api("/api/v1/auth/status");
        showAuth(status.bootstrap_required);
        notice(status.bootstrap_required?"پایگاه داده آماده ساخت نخستین مدیر است.":"برای ادامه وارد سامانه شوید.");
      }catch{
        showAuth(false);
        notice("رابط ERP بارگذاری شد؛ سرویس API هنوز در دسترس نیست. تا زمان اتصال API امن به پایگاه داده، ورود و عملیات داده‌ای فعال نیستند.","error");
      }
    }
  }
  const bufferToBase64Url = buffer => {
    const bytes=new Uint8Array(buffer);let binary="";
    for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).split("=").join("").split("+").join("-").split("/").join("_");
  };
  const base64UrlToBuffer = value => {
    const base64=String(value).split("-").join("+").split("_").join("/")+"=".repeat((4-String(value).length%4)%4);
    return Uint8Array.from(atob(base64),char=>char.charCodeAt(0)).buffer;
  };
  const serializePasskey = credential => ({
    id:credential.id,rawId:bufferToBase64Url(credential.rawId),type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment,
    response:{
      clientDataJSON:bufferToBase64Url(credential.response.clientDataJSON),
      authenticatorData:bufferToBase64Url(credential.response.authenticatorData),
      signature:bufferToBase64Url(credential.response.signature),
      userHandle:credential.response.userHandle?bufferToBase64Url(credential.response.userHandle):null
    },
    clientExtensionResults:credential.getClientExtensionResults()
  });
  forms.bootstrap.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.bootstrap.querySelector("button");submit.disabled=true;
    const data=formData(forms.bootstrap),secret=data.bootstrap_secret;delete data.bootstrap_secret;
    try{
      if(!navigator.credentials?.create||!window.isSecureContext)throw new Error("این مرورگر از Passkey در مبدأ امن پشتیبانی نمی‌کند.");
      const options=await api("/api/v1/auth/passkey/bootstrap/options",{method:"POST",headers:{"x-bootstrap-secret":secret},body:JSON.stringify(data)});
      const challenge=options.challenge;options.challenge=base64UrlToBuffer(options.challenge);options.user.id=base64UrlToBuffer(options.user.id);
      if(options.excludeCredentials)options.excludeCredentials=options.excludeCredentials.map(item=>({...item,id:base64UrlToBuffer(item.id)}));
      const credential=await navigator.credentials.create({publicKey:options});
      if(!credential)throw new Error("ثبت Passkey لغو شد.");
      await api("/api/v1/auth/passkey/bootstrap/verify",{method:"POST",headers:{"x-bootstrap-secret":secret},body:JSON.stringify({challenge,response:serializePasskey(credential)})});
      forms.bootstrap.reset();notice("Passkey مدیر اولیه ثبت شد.","success");await refreshAuth();
    }catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
  });
  forms.login.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.login.querySelector("button[type=submit]");submit.disabled=true;submit.querySelector("span").textContent="در حال بررسی اطلاعات…";
    try{await api("/api/v1/auth/login",{method:"POST",body:JSON.stringify(formData(forms.login))});forms.login.reset();$("loginPassword").type="password";$("toggleLoginPassword").textContent="نمایش";$("toggleLoginPassword").setAttribute("aria-pressed","false");await refreshAuth();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;submit.querySelector("span").textContent="ورود با رمز عبور";}
  });
  $("passkeyLoginButton").addEventListener("click",async()=>{
    const button=$("passkeyLoginButton"),identifier=forms.login.elements.identifier.value.trim();
    if(!identifier){notice("ابتدا نام کاربری یا ایمیل را وارد کنید.","error");forms.login.elements.identifier.focus();return;}
    button.disabled=true;button.textContent="در حال تأیید Passkey…";
    try{
      if(!navigator.credentials?.get||!window.isSecureContext)throw new Error("این مرورگر از Passkey در مبدأ امن پشتیبانی نمی‌کند.");
      const options=await api("/api/v1/auth/passkey/options?identifier="+encodeURIComponent(identifier));
      const challenge=options.challenge;options.challenge=base64UrlToBuffer(options.challenge);
      if(options.allowCredentials)options.allowCredentials=options.allowCredentials.map(item=>({...item,id:base64UrlToBuffer(item.id)}));
      const assertion=await navigator.credentials.get({publicKey:options});
      if(!assertion)throw new Error("ورود با Passkey لغو شد.");
      await api("/api/v1/auth/passkey/verify",{method:"POST",body:JSON.stringify({challenge,response:serializePasskey(assertion)})});
      forms.login.reset();await refreshAuth();
    }catch(e){notice(e.message,"error");}
    finally{button.disabled=false;button.textContent="ورود با Passkey";}
  });
  forms.unit.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.unit.querySelector("button");submit.disabled=true;
    const data=formData(forms.unit);if(!data.parent_id)data.parent_id=null;
    try{await api("/api/v1/org-units",{method:"POST",body:JSON.stringify(data)});forms.unit.reset();notice("واحد سازمانی ثبت شد و رویداد ممیزی ذخیره شد.","success");await loadUnits();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
  });
  forms.edit.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.edit.querySelector('button[type="submit"]');submit.disabled=true;
    const data=formData(forms.edit),id=data.id;delete data.id;delete data.code;if(!data.parent_id)data.parent_id=null;
    try{await api("/api/v1/org-units/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(data)});cancelEdit();notice("واحد سازمانی ویرایش شد و رویداد ممیزی ثبت شد.","success");await loadUnits();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
  });
  forms.users.elements.role.addEventListener("change",syncUserScopeRequirement);
  forms.users.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.users.querySelector('button[type="submit"]');submit.disabled=true;
    const data=formData(forms.users),role=data.role,scopeIds=Array.from(forms.users.elements.scope_ids.selectedOptions).map(option=>option.value);
    const payload={username:data.username,email:data.email,display_name:data.display_name,password:data.password,roles:[role],scope_ids:role==="admin"?[]:scopeIds};
    try{await api("/api/v1/users",{method:"POST",body:JSON.stringify(payload)});forms.users.reset();syncUserScopeRequirement();notice("کاربر ایجاد شد؛ نقش و محدوده دسترسی ثبت شد.","success");await loadUsers();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
  });
  $("unitsTable").addEventListener("click",async event=>{
    const button=event.target.closest("button[data-action]");if(!button)return;
    const unit=units.find(item=>item.id===button.dataset.id);if(!unit)return;
    if(button.dataset.action==="edit"){startEdit(unit);return;}
    if(button.dataset.action==="status"){
      button.disabled=true;
      try{await api("/api/v1/org-units/"+encodeURIComponent(unit.id)+"/"+button.dataset.next,{method:"POST"});cancelEdit();notice(button.dataset.next==="deactivate"?"واحد سازمانی غیرفعال شد.":"واحد سازمانی فعال شد.","success");await loadUnits();}
      catch(e){notice(e.message,"error");}finally{button.disabled=false;}
    }
  });
  $("usersTable").addEventListener("click",async event=>{
    const editButton=event.target.closest("button[data-action='user-access-edit']");if(editButton){const user=users.find(item=>item.id===editButton.dataset.id);if(user)startEditUserAccess(user);return;}
    const button=event.target.closest("button[data-action='user-status']");if(!button)return;
    button.disabled=true;
    try{await api("/api/v1/users/"+encodeURIComponent(button.dataset.id)+"/"+button.dataset.next,{method:"POST"});notice(button.dataset.next==="deactivate"?"کاربر غیرفعال شد و نشست‌هایش باطل شدند.":"کاربر فعال شد.","success");await loadUsers();}
    catch(e){notice(e.message,"error");}finally{button.disabled=false;}
  });
  forms.access.elements.role.addEventListener("change",syncAccessScopeRequirement);
  forms.access.addEventListener("submit",async event=>{event.preventDefault();if(!editingAccessUserId)return;const submit=forms.access.querySelector("button");submit.disabled=true;const role=forms.access.elements.role.value;const scopeIds=Array.from(forms.access.elements.scope_ids.selectedOptions).map(option=>option.value);
    try{await api("/api/v1/users/"+encodeURIComponent(editingAccessUserId),{method:"PATCH",body:JSON.stringify({roles:[role],scope_ids:role==="admin"?[]:scopeIds})});cancelUserAccessEdit();notice("نقش و محدوده دسترسی به‌روزرسانی شد.","success");await loadUsers();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}});
  $("cancelUserAccessButton").addEventListener("click",cancelUserAccessEdit);
  $("refreshAuditButton").addEventListener("click",()=>loadAudit(true));
  $("moreAuditButton").addEventListener("click",()=>loadAudit(false));
  $("cancelEditButton").addEventListener("click",cancelEdit);
  $("logoutButton").addEventListener("click",async()=>{
    try{await api("/api/v1/auth/logout",{method:"POST"});currentUser=null;cancelEdit();showAuth(false);notice("از سامانه خارج شدید.","success");}
    catch(e){notice(e.message,"error");}
  });
  refreshAuth().catch(()=>notice("ارتباط با API برقرار نشد. وضعیت Worker و اتصال D1 را بررسی کنید.","error"));
})().catch(error => { const notice = document.getElementById("notice"); if (notice) { notice.textContent = error.message || "بارگذاری ماژول ورود ناموفق بود."; notice.className = "notice error"; } });
