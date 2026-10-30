const isoDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
const isoInstant = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const text = value => String(value ?? "").trim();
const timeSelect = `SELECT t.id,t.employee_id,e.employee_no,e.display_name,e.org_unit_id,t.event_type,t.occurred_at,t.idempotency_key,t.created_at
  FROM employee_time_events t JOIN employees e ON e.id=t.employee_id`;
const leaveSelect = `SELECT l.id,l.employee_id,e.employee_no,e.display_name,e.org_unit_id,l.leave_type,l.start_date,l.end_date,l.reason,l.status,l.decision_note,l.decided_by,l.decided_at,l.created_at,l.updated_at
  FROM employee_leave_requests l JOIN employees e ON e.id=l.employee_id`;

async function employeeScope(employeeId,env,user,permission,action,helpers) {
  const employee=await env.DB.prepare("SELECT id,org_unit_id,employment_status FROM employees WHERE id=?").bind(employeeId).first();
  if(!employee)return {error:helpers.fail(404,"employee_not_found","پرونده کارمند پیدا نشد.")};
  if(!await helpers.hasPermission(env,user,permission,action,employee.org_unit_id))
    return {error:helpers.fail(403,"forbidden","دسترسی به این پرونده در محدوده سازمانی شما مجاز نیست.")};
  return {employee};
}
function pagination(url,helpers) {
  const limit=Number(url.searchParams.get("limit")??50),offset=Number(url.searchParams.get("offset")??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>10000)
    return {error:helpers.fail(400,"invalid_pagination","limit باید ۱ تا ۱۰۰ و offset باید ۰ تا ۱۰۰۰۰ باشد.")};
  return {limit,offset};
}
async function listRecords(url,env,user,helpers,kind) {
  const {fail,json}=helpers, page=pagination(url,helpers);if(page.error)return page.error;
  const employeeId=url.searchParams.get("employee_id");
  if(employeeId){const scope=await employeeScope(employeeId,env,user,kind==="time"?"time_entry":"leave","read",helpers);if(scope.error)return scope.error;}
  let sql=kind==="time"?timeSelect:leaveSelect,values=[],clauses=[];
  if(!user.roles.includes("admin")){
    sql=`WITH RECURSIVE accessible(id) AS (
      SELECT org_unit_id FROM user_org_scopes WHERE user_id=?
      UNION SELECT child.id FROM org_units child JOIN accessible a ON child.parent_id=a.id
    ) `+sql;
    values.push(user.id);clauses.push("e.org_unit_id IN (SELECT id FROM accessible)");
  }
  if(employeeId){clauses.push("e.id=?");values.push(employeeId);}
  if(clauses.length)sql+=" WHERE "+clauses.join(" AND ");
  sql+=kind==="time"?" ORDER BY t.occurred_at DESC,t.id DESC LIMIT ? OFFSET ?":" ORDER BY l.start_date DESC,l.created_at DESC LIMIT ? OFFSET ?";
  values.push(page.limit+1,page.offset);
  const result=await env.DB.prepare(sql).bind(...values).all(),hasMore=result.results.length>page.limit;
  return json({data:result.results.slice(0,page.limit),meta:{limit:page.limit,offset:page.offset,count:Math.min(page.limit,result.results.length),has_more:hasMore}});
}
async function createTimeEvent(request,env,user,helpers) {
  const {readJson,fail,json}=helpers;let body;try{body=await readJson(request);}catch{return fail(400,"invalid_json","بدنه درخواست معتبر نیست.");}
  const employeeId=text(body.employee_id),eventType=text(body.event_type),occurredAt=text(body.occurred_at),key=text(body.idempotency_key);
  if(!employeeId||!["clock_in","clock_out"].includes(eventType)||!isoInstant(occurredAt)||!key||key.length>128)
    return fail(400,"validation_failed","کارمند، نوع رویداد، زمان ISO-8601 و کلید idempotency معتبر الزامی است.");
  const scope=await employeeScope(employeeId,env,user,"time_entry","create",helpers);if(scope.error)return scope.error;
  if(scope.employee.employment_status!=="active")return fail(409,"employee_inactive","ثبت تردد برای کارمند غیرفعال مجاز نیست.");
  const duplicate=await env.DB.prepare("SELECT id FROM employee_time_events WHERE employee_id=? AND idempotency_key=?").bind(employeeId,key).first();
  if(duplicate)return fail(409,"duplicate_event","این کلید idempotency قبلاً استفاده شده است.");
  const last=await env.DB.prepare("SELECT event_type,occurred_at FROM employee_time_events WHERE employee_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1").bind(employeeId).first();
  if(last&&Date.parse(occurredAt)<=Date.parse(last.occurred_at))return fail(409,"event_out_of_order","زمان رویداد باید پس از آخرین رویداد ثبت‌شده باشد.");
  if(eventType==="clock_in"&&last?.event_type==="clock_in")return fail(409,"already_clocked_in","برای این کارمند هنوز خروج ثبت نشده است.");
  if(eventType==="clock_out"&&(!last||last.event_type!=="clock_in"))return fail(409,"not_clocked_in","برای ثبت خروج، ورود باز لازم است.");
  const id=crypto.randomUUID();
  try{await env.DB.batch([
    env.DB.prepare("INSERT INTO employee_time_events (id,employee_id,event_type,occurred_at,idempotency_key,created_by) VALUES (?,?,?,?,?,?)").bind(id,employeeId,eventType,occurredAt,key,user.id),
    env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,"employee_time_event.created","employee_time_event",id,JSON.stringify({employee_id:employeeId,event_type:eventType,occurred_at:occurredAt}))
  ]);}catch(error){if(/UNIQUE constraint failed/i.test(String(error)))return fail(409,"duplicate_event","رویداد تکراری است.");throw error;}
  return json({data:await env.DB.prepare(timeSelect+" WHERE t.id=?").bind(id).first()},201);
}
async function createLeave(request,env,user,helpers) {
  const {readJson,fail,json}=helpers;let body;try{body=await readJson(request);}catch{return fail(400,"invalid_json","بدنه درخواست معتبر نیست.");}
  const employeeId=text(body.employee_id),leaveType=text(body.leave_type),start=text(body.start_date),end=text(body.end_date),reason=text(body.reason);
  if(!employeeId||leaveType.length<2||leaveType.length>32||!isoDate(start)||!isoDate(end)||end<start||reason.length>500)
    return fail(400,"validation_failed","کارمند، نوع مرخصی، بازه معتبر و توضیح حداکثر ۵۰۰ نویسه لازم است.");
  const scope=await employeeScope(employeeId,env,user,"leave","create",helpers);if(scope.error)return scope.error;
  if(scope.employee.employment_status!=="active")return fail(409,"employee_inactive","برای کارمند غیرفعال درخواست مرخصی ثبت نمی‌شود.");
  const overlap=await env.DB.prepare("SELECT id FROM employee_leave_requests WHERE employee_id=? AND status IN ('pending','approved') AND start_date<=? AND end_date>=? LIMIT 1").bind(employeeId,end,start).first();
  if(overlap)return fail(409,"leave_overlap","درخواست با مرخصی در انتظار یا تأییدشده هم‌پوشانی دارد.");
  const id=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO employee_leave_requests (id,employee_id,leave_type,start_date,end_date,reason,created_by) VALUES (?,?,?,?,?,?,?)").bind(id,employeeId,leaveType,start,end,reason||null,user.id),
    env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,"employee_leave.created","employee_leave_request",id,JSON.stringify({employee_id:employeeId,leave_type:leaveType,start_date:start,end_date:end}))
  ]);
  return json({data:await env.DB.prepare(leaveSelect+" WHERE l.id=?").bind(id).first()},201);
}
async function decideLeave(request,id,env,user,helpers) {
  const {readJson,fail,json}=helpers,current=await env.DB.prepare(leaveSelect+" WHERE l.id=?").bind(id).first();
  if(!current)return fail(404,"leave_not_found","درخواست مرخصی پیدا نشد.");
  if(!await helpers.hasPermission(env,user,"leave","update",current.org_unit_id))return fail(403,"forbidden","تصمیم‌گیری درباره این درخواست مجاز نیست.");
  let body;try{body=await readJson(request);}catch{return fail(400,"invalid_json","بدنه درخواست معتبر نیست.");}
  const status=text(body.status),note=text(body.decision_note);
  if(!["approved","rejected"].includes(status)||note.length>500)return fail(400,"validation_failed","وضعیت باید approved یا rejected و توضیح حداکثر ۵۰۰ نویسه باشد.");
  if(current.status!=="pending")return fail(409,"leave_already_decided","فقط درخواست در انتظار قابل تصمیم‌گیری است.");
  await env.DB.batch([
    env.DB.prepare("UPDATE employee_leave_requests SET status=?,decision_note=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(status,note||null,user.id,id),
    env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,"employee_leave."+status,"employee_leave_request",id,JSON.stringify({employee_id:current.employee_id}))
  ]);
  const updated=await env.DB.prepare(leaveSelect+" WHERE l.id=?").bind(id).first();
  if(updated.status!==status)return fail(409,"leave_already_decided","درخواست هم‌زمان توسط کاربر دیگری تعیین تکلیف شد.");
  return json({data:updated});
}
export async function handleHrTimeRequest(request,env,user,helpers) {
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  if(!path.startsWith("/api/v1/hr/time-events")&&!path.startsWith("/api/v1/hr/leave-requests"))return null;
  if(!user)return helpers.fail(401,"unauthenticated","برای دسترسی به حضور و غیاب وارد سامانه شوید.");
  if(path==="/api/v1/hr/time-events"&&method==="GET")return listRecords(url,env,user,helpers,"time");
  if(path==="/api/v1/hr/time-events"&&method==="POST")return createTimeEvent(request,env,user,helpers);
  if(path==="/api/v1/hr/leave-requests"&&method==="GET")return listRecords(url,env,user,helpers,"leave");
  if(path==="/api/v1/hr/leave-requests"&&method==="POST")return createLeave(request,env,user,helpers);
  const match=path.match(/^\/api\/v1\/hr\/leave-requests\/([^/]+)$/);
  if(match&&method==="PATCH")return decideLeave(request,match[1],env,user,helpers);
  return helpers.fail(404,"not_found","مسیر حضور و غیاب پیدا نشد.");
}
