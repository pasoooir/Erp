(() => {
  const $ = id => document.getElementById(id);
  const forms = { bootstrap:$("bootstrapForm"), login:$("loginForm"), unit:$("unitForm"), edit:$("editUnitForm"), users:$("userForm") };
  let currentUser=null, units=[], users=[];
  const labels={company:"شرکت",site:"سایت / کارخانه",department:"واحد سازمانی",position:"سمت",production_line:"خط تولید",warehouse:"انبار"};
  const roleLabels={admin:"مدیر سراسری",org_manager:"مدیر واحد سازمانی",operator:"اپراتور",reader:"مشاهده‌گر"};
  function notice(message,kind=""){const el=$("notice");el.textContent=message;el.className="notice"+(kind?" "+kind:"");}
  async function api(path,options={}){
    const response=await fetch(path,{credentials:"same-origin",...options,headers:{...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})}});
    let payload;try{payload=await response.json();}catch{throw new Error("پاسخ معتبر از سرور دریافت نشد.");}
    if(!response.ok)throw new Error(payload?.error?.message||"درخواست ناموفق بود.");
    return payload.data;
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
    $("createPanel").classList.toggle("hidden",!canManage);
    $("editPanel").classList.toggle("hidden",!canManage||!forms.edit.elements.id.value);
    $("usersPanel").classList.toggle("hidden",!isAdmin);
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
      for(const value of [user.display_name,user.email,String(user.roles||"").split(",").map(role=>roleLabels[role]||role).join("، ")||"—",(user.scopes||(String(user.roles||"").split(",").includes("admin")?"سراسری":"—")),user.status==="active"?"فعال":"غیرفعال"]){
        const td=document.createElement("td");td.textContent=value;tr.appendChild(td);
      }
      const actions=document.createElement("td");actions.className="table-actions";
      if(user.id!==currentUser?.id){
        const button=document.createElement("button");button.type="button";button.className="button small secondary";button.dataset.action="user-status";button.dataset.id=user.id;button.dataset.next=user.status==="active"?"deactivate":"activate";button.textContent=user.status==="active"?"غیرفعال‌سازی":"فعال‌سازی";actions.appendChild(button);
      }else{actions.textContent="حساب فعلی";}
      tr.appendChild(actions);body.appendChild(tr);
    }
  }
  async function loadUsers(){
    if(!currentUser?.roles.includes("admin"))return;
    try{users=await api("/api/v1/users");renderUsers();}
    catch(e){notice(e.message,"error");}
  }
  async function refreshAuth(){
    try{
      const user=await api("/api/v1/auth/me");showApp(user);notice("ورود موفق بود؛ داده‌ها از D1 خوانده می‌شوند.","success");
      await loadUnits();if(user.roles.includes("admin"))await loadUsers();
    }catch{
      currentUser=null;cancelEdit();const status=await api("/api/v1/auth/status");showAuth(status.bootstrap_required);notice(status.bootstrap_required?"پایگاه داده آماده ساخت نخستین مدیر است.":"برای ادامه وارد سامانه شوید.");
    }
  }
  forms.bootstrap.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.bootstrap.querySelector("button");submit.disabled=true;
    const data=formData(forms.bootstrap),secret=data.bootstrap_secret;delete data.bootstrap_secret;
    try{await api("/api/v1/auth/bootstrap",{method:"POST",headers:{"x-bootstrap-secret":secret},body:JSON.stringify(data)});forms.bootstrap.reset();notice("مدیر اولیه ایجاد شد.","success");await refreshAuth();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
  });
  forms.login.addEventListener("submit",async event=>{
    event.preventDefault();const submit=forms.login.querySelector("button");submit.disabled=true;
    try{await api("/api/v1/auth/login",{method:"POST",body:JSON.stringify(formData(forms.login))});forms.login.reset();await refreshAuth();}
    catch(e){notice(e.message,"error");}finally{submit.disabled=false;}
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
    const payload={email:data.email,display_name:data.display_name,password:data.password,roles:[role],scope_ids:role==="admin"?[]:scopeIds};
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
    const button=event.target.closest("button[data-action='user-status']");if(!button)return;
    button.disabled=true;
    try{await api("/api/v1/users/"+encodeURIComponent(button.dataset.id)+"/"+button.dataset.next,{method:"POST"});notice(button.dataset.next==="deactivate"?"کاربر غیرفعال شد و نشست‌هایش باطل شدند.":"کاربر فعال شد.","success");await loadUsers();}
    catch(e){notice(e.message,"error");}finally{button.disabled=false;}
  });
  $("cancelEditButton").addEventListener("click",cancelEdit);
  $("logoutButton").addEventListener("click",async()=>{
    try{await api("/api/v1/auth/logout",{method:"POST"});currentUser=null;cancelEdit();showAuth(false);notice("از سامانه خارج شدید.","success");}
    catch(e){notice(e.message,"error");}
  });
  refreshAuth().catch(()=>notice("ارتباط با API برقرار نشد. وضعیت Worker و اتصال D1 را بررسی کنید.","error"));
})();
