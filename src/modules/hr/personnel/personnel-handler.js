const EMPLOYEE_NO = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;
const CONTRACT_NO = /^[A-Z0-9][A-Z0-9._/-]{1,39}$/;
const EMPLOYEE_STATUSES = new Set(["active", "leave", "terminated"]);
const CONTRACT_STATUSES = new Set(["draft", "active", "expired", "terminated"]);
const isoDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const emailValue = value => value == null || value === "" ? null : String(value).trim().toLowerCase();
const validEmail = value => value === null || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const textValue = value => String(value ?? "").trim();
const employeeSelect = `SELECT e.id,e.employee_no,e.display_name,e.work_email,e.org_unit_id,
    ou.code AS org_unit_code,ou.name AS org_unit_name,e.position_unit_id,pu.name AS position_name,
    e.employment_status,e.hired_on,e.ended_on,e.created_at,e.updated_at,
    (SELECT COUNT(*) FROM employee_contracts c WHERE c.employee_id=e.id) AS contract_count
  FROM employees e JOIN org_units ou ON ou.id=e.org_unit_id
  LEFT JOIN org_units pu ON pu.id=e.position_unit_id`;

function validateEmployee(value) {
  const employeeNo = textValue(value.employee_no).toUpperCase();
  const displayName = textValue(value.display_name);
  const workEmail = emailValue(value.work_email);
  const orgUnitId = textValue(value.org_unit_id);
  const positionUnitId = textValue(value.position_unit_id) || null;
  const employmentStatus = textValue(value.employment_status || "active");
  const hiredOn = textValue(value.hired_on);
  const endedOn = textValue(value.ended_on) || null;
  if (!EMPLOYEE_NO.test(employeeNo)) return { error: "شماره پرسنلی باید ۲ تا ۳۲ نویسه معتبر و یکتا باشد." };
  if (!displayName || displayName.length > 120) return { error: "نام نمایشی الزامی و حداکثر ۱۲۰ نویسه است." };
  if (!validEmail(workEmail)) return { error: "ایمیل سازمانی معتبر نیست." };
  if (!orgUnitId || orgUnitId.length > 64) return { error: "واحد سازمانی معتبر الزامی است." };
  if (!EMPLOYEE_STATUSES.has(employmentStatus)) return { error: "وضعیت استخدام معتبر نیست." };
  if (!isoDate(hiredOn) || (endedOn && !isoDate(endedOn))) return { error: "تاریخ استخدام یا پایان همکاری معتبر نیست." };
  if (endedOn && endedOn < hiredOn) return { error: "تاریخ پایان همکاری نمی‌تواند پیش از تاریخ استخدام باشد." };
  if (employmentStatus === "terminated" && !endedOn) return { error: "برای کارمند خاتمه‌یافته، تاریخ پایان همکاری الزامی است." };
  return { value: { employeeNo, displayName, workEmail, orgUnitId, positionUnitId, employmentStatus, hiredOn, endedOn } };
}

function validateContract(value) {
  const contractNo = textValue(value.contract_no).toUpperCase();
  const contractType = textValue(value.contract_type);
  const startDate = textValue(value.start_date);
  const endDate = textValue(value.end_date) || null;
  const signedOn = textValue(value.signed_on) || null;
  const status = textValue(value.status || "draft");
  if (!CONTRACT_NO.test(contractNo)) return { error: "شماره قرارداد باید ۲ تا ۴۰ نویسه معتبر و یکتا باشد." };
  if (contractType.length < 2 || contractType.length > 40) return { error: "نوع قرارداد الزامی و حداکثر ۴۰ نویسه است." };
  if (!isoDate(startDate) || (endDate && !isoDate(endDate)) || (signedOn && !isoDate(signedOn)))
    return { error: "تاریخ شروع، پایان یا امضای قرارداد معتبر نیست." };
  if (endDate && endDate < startDate) return { error: "تاریخ پایان قرارداد نمی‌تواند پیش از تاریخ شروع باشد." };
  if (!CONTRACT_STATUSES.has(status)) return { error: "وضعیت قرارداد معتبر نیست." };
  return { value: { contractNo, contractType, startDate, endDate, signedOn, status } };
}

async function employeeById(env, id) {
  return env.DB.prepare("SELECT id,employee_no,org_unit_id,position_unit_id,employment_status,hired_on,ended_on FROM employees WHERE id=?").bind(id).first();
}
async function contractById(env, id) {
  return env.DB.prepare(`SELECT c.id,c.employee_id,c.contract_no,c.contract_type,c.start_date,c.end_date,c.signed_on,c.status,
      e.org_unit_id,e.employee_no,e.display_name
    FROM employee_contracts c JOIN employees e ON e.id=c.employee_id WHERE c.id=?`).bind(id).first();
}
async function validOrgAndPosition(env, orgUnitId, positionUnitId) {
  const org = await env.DB.prepare("SELECT id,unit_type,status FROM org_units WHERE id=?").bind(orgUnitId).first();
  if (!org || org.status !== "active" || !["site", "department"].includes(org.unit_type))
    return "کارمند باید به یک سایت یا واحد سازمانی فعال منتسب شود.";
  if (positionUnitId) {
    const position = await env.DB.prepare("SELECT id,parent_id,unit_type,status FROM org_units WHERE id=?").bind(positionUnitId).first();
    if (!position || position.status !== "active" || position.unit_type !== "position" || position.parent_id !== orgUnitId)
      return "سمت انتخاب‌شده باید فعال و مستقیماً زیرمجموعه واحد سازمانی کارمند باشد.";
  }
  return null;
}

async function listEmployees(url, env, user, helpers) {
  const { fail, hasPermission } = helpers;
  if (!await hasPermission(env, user, "employee", "read")) return fail(403, "forbidden", "مشاهده پرونده کارکنان مجاز نیست.");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000)
    return fail(400, "invalid_pagination", "limit باید ۱ تا ۱۰۰ و offset باید ۰ تا ۱۰۰۰۰ باشد.");
  const requestedOrg = url.searchParams.get("org_unit_id");
  let sql = employeeSelect;
  const clauses = [], values = [];
  if (!user.roles.includes("admin")) {
    sql = `WITH RECURSIVE accessible(id) AS (
      SELECT org_unit_id FROM user_org_scopes WHERE user_id=?
      UNION SELECT child.id FROM org_units child JOIN accessible a ON child.parent_id=a.id
    ) ` + sql;
    values.push(user.id);
    const scope = await env.DB.prepare("SELECT 1 FROM user_org_scopes WHERE user_id=? LIMIT 1").bind(user.id).first();
    if (!scope) return fail(403, "scope_required", "برای مشاهده کارکنان محدوده سازمانی فعالی ندارید.");
    clauses.push("e.org_unit_id IN (SELECT id FROM accessible)");
  }
  if (requestedOrg) {
    if (!await hasPermission(env, user, "employee", "read", requestedOrg))
      return fail(403, "forbidden", "مشاهده کارکنان این واحد مجاز نیست.");
    clauses.push("e.org_unit_id=?"); values.push(requestedOrg);
  }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY e.employee_no LIMIT ? OFFSET ?";
  values.push(limit + 1, offset);
  const result = await env.DB.prepare(sql).bind(...values).all();
  const hasMore = result.results.length > limit;
  return helpers.json({ data: result.results.slice(0, limit), meta: { limit, offset, count: Math.min(limit, result.results.length), has_more: hasMore } });
}

async function createEmployee(request, env, user, helpers) {
  const { readJson, fail, hasPermission, audit, json } = helpers;
  let body; try { body = await readJson(request); } catch { return fail(400, "invalid_json", "بدنه درخواست معتبر نیست."); }
  const parsed = validateEmployee(body);
  if (parsed.error) return fail(400, "validation_failed", parsed.error);
  const value = parsed.value;
  if (!await hasPermission(env, user, "employee", "create", value.orgUnitId))
    return fail(403, "forbidden", "ایجاد پرونده در این محدوده سازمانی مجاز نیست.");
  const relationError = await validOrgAndPosition(env, value.orgUnitId, value.positionUnitId);
  if (relationError) return fail(400, "invalid_organization", relationError);
  const duplicate = await env.DB.prepare("SELECT 1 FROM employees WHERE employee_no=? OR (? IS NOT NULL AND work_email=?) LIMIT 1")
    .bind(value.employeeNo, value.workEmail, value.workEmail).first();
  if (duplicate) return fail(409, "employee_conflict", "شماره پرسنلی یا ایمیل سازمانی قبلاً ثبت شده است.");
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO employees
        (id,employee_no,display_name,work_email,org_unit_id,position_unit_id,employment_status,hired_on,ended_on,created_by,updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,value.employeeNo,value.displayName,value.workEmail,value.orgUnitId,value.positionUnitId,value.employmentStatus,value.hiredOn,value.endedOn,user.id,user.id),
      env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),user.id,"employee.created","employee",id,JSON.stringify({employee_no:value.employeeNo,org_unit_id:value.orgUnitId}))
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return fail(409, "employee_conflict", "شماره پرسنلی یا ایمیل سازمانی قبلاً ثبت شده است.");
    throw error;
  }
  const created = await env.DB.prepare(employeeSelect + " WHERE e.id=?").bind(id).first();
  return json({ data: created }, 201);
}

async function getEmployee(id, env, user, helpers) {
  const { fail, hasPermission, json } = helpers;
  const employee = await env.DB.prepare(employeeSelect + " WHERE e.id=?").bind(id).first();
  if (!employee) return fail(404, "employee_not_found", "پرونده کارمند پیدا نشد.");
  if (!await hasPermission(env, user, "employee", "read", employee.org_unit_id))
    return fail(403, "forbidden", "مشاهده این پرونده مجاز نیست.");
  return json({ data: employee });
}

async function updateEmployee(request, id, env, user, helpers) {
  const { readJson, fail, hasPermission, json } = helpers;
  const current = await employeeById(env, id);
  if (!current) return fail(404, "employee_not_found", "پرونده کارمند پیدا نشد.");
  if (!await hasPermission(env, user, "employee", "update", current.org_unit_id))
    return fail(403, "forbidden", "ویرایش این پرونده مجاز نیست.");
  let body; try { body = await readJson(request); } catch { return fail(400, "invalid_json", "بدنه درخواست معتبر نیست."); }
  const allowed = new Set(["display_name","work_email","org_unit_id","position_unit_id","employment_status","hired_on","ended_on"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return fail(400, "validation_failed", "فیلدهای ارسالی مجاز نیستند.");
  const merged = {
    employee_no: current.employee_no,
    display_name: body.display_name ?? (await env.DB.prepare("SELECT display_name FROM employees WHERE id=?").bind(id).first()).display_name,
    work_email: body.work_email ?? (await env.DB.prepare("SELECT work_email FROM employees WHERE id=?").bind(id).first()).work_email,
    org_unit_id: body.org_unit_id ?? current.org_unit_id,
    position_unit_id: body.position_unit_id ?? current.position_unit_id,
    employment_status: body.employment_status ?? current.employment_status,
    hired_on: body.hired_on ?? current.hired_on,
    ended_on: body.ended_on ?? current.ended_on
  };
  const parsed = validateEmployee(merged);
  if (parsed.error) return fail(400, "validation_failed", parsed.error);
  const value = parsed.value;
  if (!await hasPermission(env, user, "employee", "update", value.orgUnitId))
    return fail(403, "forbidden", "انتقال پرونده به محدوده غیرمجاز ممکن نیست.");
  const relationError = await validOrgAndPosition(env, value.orgUnitId, value.positionUnitId);
  if (relationError) return fail(400, "invalid_organization", relationError);
  const duplicate = await env.DB.prepare("SELECT 1 FROM employees WHERE id<>? AND (? IS NOT NULL AND work_email=?) LIMIT 1")
    .bind(id,value.workEmail,value.workEmail).first();
  if (duplicate) return fail(409, "employee_conflict", "ایمیل سازمانی قبلاً ثبت شده است.");
  await env.DB.batch([
    env.DB.prepare(`UPDATE employees SET display_name=?,work_email=?,org_unit_id=?,position_unit_id=?,employment_status=?,hired_on=?,ended_on=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(value.displayName,value.workEmail,value.orgUnitId,value.positionUnitId,value.employmentStatus,value.hiredOn,value.endedOn,user.id,id),
    env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),user.id,"employee.updated","employee",id,JSON.stringify({fields:Object.keys(body)}))
  ]);
  return json({ data: await env.DB.prepare(employeeSelect + " WHERE e.id=?").bind(id).first() });
}

async function listContracts(url, env, user, helpers) {
  const { fail, hasPermission, json } = helpers;
  if (!await hasPermission(env, user, "contract", "read")) return fail(403, "forbidden", "مشاهده قراردادها مجاز نیست.");
  const limit = Number(url.searchParams.get("limit") ?? 50), offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000)
    return fail(400, "invalid_pagination", "limit باید ۱ تا ۱۰۰ و offset باید ۰ تا ۱۰۰۰۰ باشد.");
  const employeeId = url.searchParams.get("employee_id");
  let sql = `SELECT c.id,c.employee_id,e.employee_no,e.display_name,e.org_unit_id,c.contract_no,c.contract_type,c.start_date,c.end_date,c.signed_on,c.status,c.created_at,c.updated_at
    FROM employee_contracts c JOIN employees e ON e.id=c.employee_id`;
  const clauses = [], values = [];
  if (!user.roles.includes("admin")) {
    sql = `WITH RECURSIVE accessible(id) AS (
      SELECT org_unit_id FROM user_org_scopes WHERE user_id=?
      UNION SELECT child.id FROM org_units child JOIN accessible a ON child.parent_id=a.id
    ) ` + sql;
    values.push(user.id);
    clauses.push("e.org_unit_id IN (SELECT id FROM accessible)");
  }
  if (employeeId) {
    const employee = await employeeById(env, employeeId);
    if (!employee) return fail(404, "employee_not_found", "پرونده کارمند پیدا نشد.");
    if (!await hasPermission(env, user, "contract", "read", employee.org_unit_id))
      return fail(403, "forbidden", "مشاهده قراردادهای این کارمند مجاز نیست.");
    clauses.push("c.employee_id=?"); values.push(employeeId);
  }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY c.start_date DESC,c.contract_no LIMIT ? OFFSET ?";
  values.push(limit + 1, offset);
  const result = await env.DB.prepare(sql).bind(...values).all();
  const hasMore = result.results.length > limit;
  return json({ data: result.results.slice(0, limit), meta: { limit, offset, count: Math.min(limit,result.results.length), has_more: hasMore } });
}

async function createContract(request, env, user, helpers) {
  const { readJson, fail, hasPermission, json } = helpers;
  let body; try { body = await readJson(request); } catch { return fail(400, "invalid_json", "بدنه درخواست معتبر نیست."); }
  const employeeId = textValue(body.employee_id);
  const employee = employeeId ? await employeeById(env, employeeId) : null;
  if (!employee) return fail(404, "employee_not_found", "پرونده کارمند پیدا نشد.");
  if (!await hasPermission(env, user, "contract", "create", employee.org_unit_id))
    return fail(403, "forbidden", "ایجاد قرارداد در این محدوده مجاز نیست.");
  const parsed = validateContract(body);
  if (parsed.error) return fail(400, "validation_failed", parsed.error);
  const value = parsed.value;
  const duplicate = await env.DB.prepare("SELECT 1 FROM employee_contracts WHERE contract_no=? LIMIT 1").bind(value.contractNo).first();
  if (duplicate) return fail(409, "contract_conflict", "شماره قرارداد قبلاً ثبت شده است.");
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO employee_contracts (id,employee_id,contract_no,contract_type,start_date,end_date,signed_on,status,created_by,updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,employeeId,value.contractNo,value.contractType,value.startDate,value.endDate,value.signedOn,value.status,user.id,user.id),
      env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),user.id,"employee_contract.created","employee_contract",id,JSON.stringify({employee_id:employeeId,contract_no:value.contractNo}))
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return fail(409, "contract_conflict", "شماره قرارداد قبلاً ثبت شده است.");
    throw error;
  }
  return json({ data: await contractById(env,id) },201);
}

async function updateContract(request,id,env,user,helpers) {
  const { readJson, fail, hasPermission, json } = helpers;
  const current = await contractById(env,id);
  if (!current) return fail(404,"contract_not_found","قرارداد پیدا نشد.");
  if (!await hasPermission(env,user,"contract","update",current.org_unit_id))
    return fail(403,"forbidden","ویرایش این قرارداد مجاز نیست.");
  let body;try{body=await readJson(request);}catch{return fail(400,"invalid_json","بدنه درخواست معتبر نیست.");}
  const allowed=new Set(["contract_type","start_date","end_date","signed_on","status"]);
  if(Object.keys(body).some(key=>!allowed.has(key)))return fail(400,"validation_failed","فیلدهای ارسالی مجاز نیستند.");
  const parsed=validateContract({
    contract_no:current.contract_no,
    contract_type:body.contract_type??current.contract_type,
    start_date:body.start_date??current.start_date,
    end_date:body.end_date??current.end_date,
    signed_on:body.signed_on??current.signed_on,
    status:body.status??current.status
  });
  if(parsed.error)return fail(400,"validation_failed",parsed.error);
  const v=parsed.value;
  await env.DB.batch([
    env.DB.prepare("UPDATE employee_contracts SET contract_type=?,start_date=?,end_date=?,signed_on=?,status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(v.contractType,v.startDate,v.endDate,v.signedOn,v.status,user.id,id),
    env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),user.id,"employee_contract.updated","employee_contract",id,JSON.stringify({fields:Object.keys(body)}))
  ]);
  return json({data:await contractById(env,id)});
}

export async function handleHrRequest(request,env,user,helpers) {
  const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname;
  if(!path.startsWith("/api/v1/hr/"))return null;
  if(!user)return helpers.fail(401,"unauthenticated","برای دسترسی به منابع انسانی وارد سامانه شوید.");
  if(path==="/api/v1/hr/employees"&&method==="GET")return listEmployees(url,env,user,helpers);
  if(path==="/api/v1/hr/employees"&&method==="POST")return createEmployee(request,env,user,helpers);
  const employeeRoute=path.match(/^\/api\/v1\/hr\/employees\/([^/]+)$/);
  if(employeeRoute&&method==="GET")return getEmployee(employeeRoute[1],env,user,helpers);
  if(employeeRoute&&method==="PATCH")return updateEmployee(request,employeeRoute[1],env,user,helpers);
  if(path==="/api/v1/hr/contracts"&&method==="GET")return listContracts(url,env,user,helpers);
  if(path==="/api/v1/hr/contracts"&&method==="POST")return createContract(request,env,user,helpers);
  const contractRoute=path.match(/^\/api\/v1\/hr\/contracts\/([^/]+)$/);
  if(contractRoute&&method==="PATCH")return updateContract(request,contractRoute[1],env,user,helpers);
  return helpers.fail(404,"not_found","مسیر منابع انسانی پیدا نشد.");
}
