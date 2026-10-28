const SESSION_SECONDS = 12 * 60 * 60;
const PASSWORD_ITERATIONS = 310_000;
const COOKIE_NAME = "erp_session";
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MINUTES = 15;
const UNIT_TYPES = new Set(["company", "site", "department", "position", "production_line", "warehouse"]);
const ALLOWED_CHILD_TYPES = {
  company: new Set([]),
  site: new Set(["company"]),
  department: new Set(["company", "site", "department"]),
  position: new Set(["department"]),
  production_line: new Set(["site", "department"]),
  warehouse: new Set(["site"])
};

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extraHeaders }
});
const fail = (status, code, message) => json({ error: { code, message } }, status);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const bytesToBase64Url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const randomToken = () => bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ""));
  const b = new TextEncoder().encode(String(right ?? ""));
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
async function hashPassword(password, saltBytes = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PASSWORD_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(saltBytes)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  const [scheme, rounds, salt, expected] = String(stored || "").split("$");
  if (scheme !== "pbkdf2-sha256" || Number(rounds) !== PASSWORD_ITERATIONS || !salt || !expected) return false;
  try {
    const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
    const saltBytes = decode(salt);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PASSWORD_ITERATIONS }, key, 256));
    return safeEqual(bytesToBase64Url(bits), expected);
  } catch { return false; }
}
function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}
function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && origin !== env.APP_ORIGIN) return null;
  return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "vary": "Origin" };
}
async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) throw new Error("content_type");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16_384) throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("json");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 16_384) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("json");
    return value;
  } catch { throw new Error("json"); }
}
const normalizeEmail = value => String(value || "").trim().toLowerCase();
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = value => typeof value === "string" && value.length >= 12 && value.length <= 128;
async function sessionUser(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.status,
      GROUP_CONCAT(r.name, ',') AS roles
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'
    GROUP BY u.id`).bind(tokenHash).first();
  return row ? { id: row.id, email: row.email, display_name: row.display_name, roles: String(row.roles || "").split(",").filter(Boolean) } : null;
}
async function createSession(userId, env) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))")
    .bind(tokenHash, userId, `+${SESSION_SECONDS} seconds`).run();
  return token;
}
async function audit(env, actorId, action, entityType, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId || null, JSON.stringify(metadata)).run();
}
async function bootstrap(request, env) {
  if (!env.BOOTSTRAP_SECRET || String(env.BOOTSTRAP_SECRET).length < 32)
    return fail(503, "bootstrap_not_configured", "راه‌اندازی اولیه در محیط سرور پیکربندی نشده است.");
  const supplied = request.headers.get("x-bootstrap-secret") || "";
  if (!safeEqual(supplied, env.BOOTSTRAP_SECRET)) return fail(403, "bootstrap_denied", "کلید راه‌اندازی معتبر نیست.");
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(400, e.message === "too_large" ? "request_too_large" : e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  const email = normalizeEmail(body.email);
  const displayName = String(body.display_name || "").trim();
  const password = body.password;
  if (!validEmail(email) || !displayName || displayName.length > 120 || !validPassword(password))
    return fail(400, "validation_failed", "ایمیل، نام نمایشی یا رمز عبور معتبر نیست؛ رمز باید حداقل ۱۲ نویسه داشته باشد.");
  const state = await env.DB.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").first();
  if (!state || state.bootstrap_complete) return fail(409, "bootstrap_already_completed", "مدیر اولیه قبلاً ساخته شده است.");
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE system_state SET bootstrap_complete=1 WHERE id=1 AND bootstrap_complete=0"),
      env.DB.prepare(`INSERT INTO users (id, email, display_name, password_hash)
        SELECT ?, ?, ?, ? WHERE (SELECT bootstrap_complete FROM system_state WHERE id=1)=1
        AND NOT EXISTS (SELECT 1 FROM users)`).bind(id, email, displayName, passwordHash),
      env.DB.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name='admin' AND EXISTS (SELECT 1 FROM users WHERE id=?)").bind(id, id),
      env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, 'auth.bootstrap_completed', 'user', ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)")
        .bind(crypto.randomUUID(), id, id, JSON.stringify({ email }), id)
    ]);
  } catch {
    return fail(500, "bootstrap_failed", "راه‌اندازی اولیه انجام نشد؛ خطای داخلی ثبت شد.");
  }
  const user = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(id).first();
  if (!user) return fail(409, "bootstrap_already_completed", "مدیر اولیه قبلاً ساخته شده است.");
  const token = await createSession(id, env);
  return json({ data: { id, email, display_name: displayName, roles: ["admin"] } }, 201, { "set-cookie": sessionCookie(token) });
}
async function login(request, env) {
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(400, e.message === "too_large" ? "request_too_large" : e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!validEmail(email) || typeof password !== "string" || password.length > 128)
    return fail(400, "validation_failed", "ایمیل یا رمز عبور معتبر نیست.");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const attemptKey = await sha256(`${email}| ${ip}`);
  const attempts = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE attempt_key=? AND attempted_at > datetime('now', ?)")
    .bind(attemptKey, `-${LOGIN_WINDOW_MINUTES} minutes`).first();
  if (Number(attempts?.count || 0) >= MAX_LOGIN_ATTEMPTS) return fail(429, "login_rate_limited", "تلاش‌های ورود بیش از حد است؛ بعداً دوباره تلاش کن.");
  const user = await env.DB.prepare("SELECT id, email, display_name, password_hash, status FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
  const valid = user && user.status === "active" && await verifyPassword(password, user.password_hash);
  if (!valid) {
    await env.DB.prepare("INSERT INTO login_attempts (attempt_key) VALUES (?)").bind(attemptKey).run();
    return fail(401, "invalid_credentials", "ایمیل یا رمز عبور نادرست است.");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const roles = await env.DB.prepare("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?").bind(user.id).all();
  const token = await createSession(user.id, env);
  await audit(env, user.id, "auth.login", "user", user.id);
  return json({ data: { id: user.id, email: user.email, display_name: user.display_name, roles: roles.results.map(row => row.name) } }, 200, { "set-cookie": sessionCookie(token) });
}
function unitValidation(body) {
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const unitType = String(body.unit_type || "").trim();
  const parentId = body.parent_id == null || body.parent_id === "" ? null : String(body.parent_id);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) return { error: "کد باید ۲ تا ۳۲ نویسه و شامل حروف لاتین، عدد، خط تیره یا زیرخط باشد." };
  if (!name || name.length > 120) return { error: "نام واحد الزامی است و حداکثر ۱۲۰ نویسه دارد." };
  if (!UNIT_TYPES.has(unitType)) return { error: "نوع واحد سازمانی معتبر نیست." };
  if (parentId && (parentId.length > 64 || parentId === "null")) return { error: "شناسه والد معتبر نیست." };
  return { value: { code, name, unitType, parentId } };
}
async function hasPermission(env, user, resource, action, orgUnitId = null) {
  if (user.roles.includes("admin")) return true;
  const permission = await env.DB.prepare(`SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id=ur.role_id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=? AND p.resource=? AND p.action=? LIMIT 1`).bind(user.id, resource, action).first();
  if (!permission) return false;
  if (!orgUnitId) return true;
  const scoped = await env.DB.prepare(`WITH RECURSIVE accessible(id) AS (
      SELECT org_unit_id FROM user_org_scopes WHERE user_id=?
      UNION
      SELECT child.id FROM org_units child JOIN accessible a ON child.parent_id=a.id
    ) SELECT id FROM accessible WHERE id=? LIMIT 1`).bind(user.id, orgUnitId).first();
  return Boolean(scoped);
}
async function safeUser(env, id) {
  return env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.status,
      GROUP_CONCAT(DISTINCT r.name) AS roles,
      GROUP_CONCAT(DISTINCT s.org_unit_id) AS scope_ids,
      GROUP_CONCAT(DISTINCT ou.code || ' — ' || ou.name) AS scopes,
      COUNT(DISTINCT s.org_unit_id) AS scope_count
    FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
    LEFT JOIN user_org_scopes s ON s.user_id=u.id LEFT JOIN org_units ou ON ou.id=s.org_unit_id
    WHERE u.id=? GROUP BY u.id`).bind(id).first();
}
async function listUsers(env, user) {
  if (!user.roles.includes("admin")) return fail(403, "forbidden", "فقط مدیر سامانه می‌تواند کاربران را مشاهده کند.");
  const result = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.status,
      GROUP_CONCAT(DISTINCT r.name) AS roles,
      GROUP_CONCAT(DISTINCT s.org_unit_id) AS scope_ids,
      GROUP_CONCAT(DISTINCT ou.code || ' — ' || ou.name) AS scopes,
      COUNT(DISTINCT s.org_unit_id) AS scope_count
    FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
    LEFT JOIN user_org_scopes s ON s.user_id=u.id LEFT JOIN org_units ou ON ou.id=s.org_unit_id
    GROUP BY u.id ORDER BY u.email LIMIT 500`).all();
  return json({ data: result.results, meta: { count: result.results.length } });
}
async function createUser(request, env, actor) {
  if (!actor.roles.includes("admin")) return fail(403, "forbidden", "فقط مدیر سامانه می‌تواند کاربر بسازد.");
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(e.message === "too_large" ? 413 : 400, e.message === "too_large" ? "request_too_large" : e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  const email=normalizeEmail(body.email), displayName=String(body.display_name||"").trim(), password=body.password;
  const roleNames=Array.isArray(body.roles)?[...new Set(body.roles.map(value=>String(value).trim()))]:[];
  const scopeIds=Array.isArray(body.scope_ids)?[...new Set(body.scope_ids.map(value=>String(value)))]:[];
  if(!validEmail(email)||!displayName||displayName.length>120||!validPassword(password))
    return fail(400,"validation_failed","ایمیل، نام نمایشی یا رمز عبور معتبر نیست.");
  if(!roleNames.length||roleNames.length>4||roleNames.some(name=>!["admin","org_manager","operator","reader"].includes(name)))
    return fail(400,"invalid_roles","نقش‌های انتخاب‌شده معتبر نیستند.");
  if(scopeIds.length>50||scopeIds.some(id=>!id||id.length>64))
    return fail(400,"invalid_scopes","فهرست محدوده‌های سازمانی معتبر نیست.");
  const hasGlobalAdmin=roleNames.includes("admin");
  if(hasGlobalAdmin&&scopeIds.length) return fail(400,"admin_scope_not_allowed","مدیر سامانه دسترسی سراسری دارد و به محدوده نیاز ندارد.");
  if(!hasGlobalAdmin&&!scopeIds.length) return fail(400,"scope_required","برای کاربر غیرمدیر دست‌کم یک محدوده سازمانی تعیین کنید.");
  const existing=await env.DB.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
  if(existing)return fail(409,"email_exists","این ایمیل قبلاً ثبت شده است.");
  const roleResult=await env.DB.prepare(`SELECT id,name FROM roles WHERE name IN (${roleNames.map(()=>"?").join(",")})`).bind(...roleNames).all();
  if(roleResult.results.length!==roleNames.length)return fail(400,"invalid_roles","یکی از نقش‌ها در پایگاه داده تعریف نشده است.");
  if(scopeIds.length){
    const scopeResult=await env.DB.prepare(`SELECT id FROM org_units WHERE status='active' AND id IN (${scopeIds.map(()=>"?").join(",")})`).bind(...scopeIds).all();
    if(scopeResult.results.length!==scopeIds.length)return fail(400,"invalid_scopes","یکی از محدوده‌ها وجود ندارد یا فعال نیست.");
  }
  const id=crypto.randomUUID(), passwordHash=await hashPassword(password);
  const statements=[env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)").bind(id,email,displayName,passwordHash)];
  for(const role of roleResult.results) statements.push(env.DB.prepare("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)").bind(id,role.id));
  for(const scopeId of scopeIds) statements.push(env.DB.prepare("INSERT INTO user_org_scopes (user_id,org_unit_id,created_by) VALUES (?,?,?)").bind(id,scopeId,actor.id));
  statements.push(env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'user.created','user',?,?)")
    .bind(crypto.randomUUID(),actor.id,id,JSON.stringify({roles:roleNames,scope_count:scopeIds.length})));
  try { await env.DB.batch(statements); }
  catch(error) {
    if(/UNIQUE constraint failed: users\.email/i.test(String(error)))return fail(409,"email_exists","این ایمیل قبلاً ثبت شده است.");
    return fail(500,"user_create_failed","ایجاد کاربر انجام نشد.");
  }
  return json({data:await safeUser(env,id)},201);
}
async function setUserStatus(env, actor, id, nextStatus) {
  if(!actor.roles.includes("admin"))return fail(403,"forbidden","فقط مدیر سامانه می‌تواند وضعیت کاربران را تغییر دهد.");
  if(id===actor.id&&nextStatus==="disabled")return fail(409,"cannot_disable_self","مدیر واردشده نمی‌تواند حساب خودش را غیرفعال کند.");
  const existing=await env.DB.prepare("SELECT id,email,status,EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=users.id AND r.name='admin') AS is_admin FROM users WHERE id=?").bind(id).first();
  if(!existing)return fail(404,"user_not_found","کاربر پیدا نشد.");
  if(existing.status===nextStatus)return json({data:await safeUser(env,id),meta:{changed:false}});
  if(nextStatus==="disabled"&&existing.is_admin){
    const count=await env.DB.prepare("SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.name='admin'").first();
    if(Number(count?.count||0)<=1)return fail(409,"last_admin","آخرین مدیر فعال سامانه را نمی‌توان غیرفعال کرد.");
  }
  try{
    const statements=[
      env.DB.prepare("UPDATE users SET status=? WHERE id=? AND status=?").bind(nextStatus,id,existing.status),
      env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) SELECT ?, ?, ?, 'user', ?, ? WHERE changes()>0")
        .bind(crypto.randomUUID(),actor.id,nextStatus==="disabled"?"user.deactivated":"user.activated",id,JSON.stringify({previous_status:existing.status,status:nextStatus}))
    ];
    if(nextStatus==="disabled")statements.push(env.DB.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL").bind(id));
    const results=await env.DB.batch(statements);
    if(Number(results[0]?.meta?.changes||0)===0)return fail(409,"user_changed","وضعیت کاربر هم‌زمان تغییر کرده است.");
  }catch{return fail(500,"user_status_failed","تغییر وضعیت کاربر انجام نشد.");}
  return json({data:await safeUser(env,id)});
}
async function updateUserAccess(request, env, actor, id) {
  if (!actor.roles.includes("admin")) return fail(403, "forbidden", "فقط مدیر سامانه می‌تواند نقش و محدوده کاربران را ویرایش کند.");
  if (id === actor.id) return fail(409, "cannot_edit_self_access", "نقش و محدوده حساب جاری قابل ویرایش نیست.");
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(e.message === "too_large" ? 413 : 400, e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  if (Object.keys(body).some(key => !["roles", "scope_ids"].includes(key)) || !Array.isArray(body.roles) || !Array.isArray(body.scope_ids))
    return fail(400, "validation_failed", "فقط فهرست roles و scope_ids را ارسال کنید.");
  const roleNames=[...new Set(body.roles.map(value=>String(value).trim()))];
  const scopeIds=[...new Set(body.scope_ids.map(value=>String(value)))];
  const allowedRoles=["admin","org_manager","operator","reader"];
  if(!roleNames.length||roleNames.length>4||roleNames.some(name=>!allowedRoles.includes(name))) return fail(400,"invalid_roles","نقش‌های انتخاب‌شده معتبر نیستند.");
  if(scopeIds.length>50||scopeIds.some(value=>!value||value.length>64)) return fail(400,"invalid_scopes","فهرست محدوده‌های سازمانی معتبر نیست.");
  if(roleNames.includes("admin")&&scopeIds.length) return fail(400,"admin_scope_not_allowed","مدیر سامانه به محدوده نیاز ندارد.");
  if(!roleNames.includes("admin")&&!scopeIds.length) return fail(400,"scope_required","برای کاربر غیرمدیر دست‌کم یک محدوده تعیین کنید.");
  const existing=await env.DB.prepare("SELECT id,status,EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=users.id AND r.name='admin') AS is_admin FROM users WHERE id=?").bind(id).first();
  if(!existing)return fail(404,"user_not_found","کاربر پیدا نشد.");
  if(existing.status==="active"&&existing.is_admin&&!roleNames.includes("admin")){
    const count=await env.DB.prepare("SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.name='admin'").first();
    if(Number(count?.count||0)<=1)return fail(409,"last_admin","نقش آخرین مدیر فعال را نمی‌توان حذف کرد.");
  }
  const roleResult=await env.DB.prepare("SELECT id,name FROM roles WHERE name IN ("+roleNames.map(()=>"?").join(",")+")").bind(...roleNames).all();
  if(roleResult.results.length!==roleNames.length)return fail(400,"invalid_roles","یکی از نقش‌ها در پایگاه داده تعریف نشده است.");
  if(scopeIds.length){
    const scopeResult=await env.DB.prepare("SELECT id FROM org_units WHERE status='active' AND id IN ("+scopeIds.map(()=>"?").join(",")+")").bind(...scopeIds).all();
    if(scopeResult.results.length!==scopeIds.length)return fail(400,"invalid_scopes","یکی از محدوده‌ها وجود ندارد یا فعال نیست.");
  }
  const statements=[
    env.DB.prepare("DELETE FROM user_roles WHERE user_id=?").bind(id),
    env.DB.prepare("DELETE FROM user_org_scopes WHERE user_id=?").bind(id)
  ];
  for(const role of roleResult.results) statements.push(env.DB.prepare("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)").bind(id,role.id));
  for(const scopeId of scopeIds) statements.push(env.DB.prepare("INSERT INTO user_org_scopes (user_id,org_unit_id,created_by) VALUES (?,?,?)").bind(id,scopeId,actor.id));
  statements.push(env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,'user.access_updated','user',?,?)")
    .bind(crypto.randomUUID(),actor.id,id,JSON.stringify({roles:roleNames,scope_count:scopeIds.length})));
  try { await env.DB.batch(statements); } catch { return fail(500,"user_access_update_failed","ویرایش نقش و محدوده کاربر انجام نشد."); }
  return json({data:await safeUser(env,id)});
}
async function createOrgUnit(request, env, user) {
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(400, e.message === "too_large" ? "request_too_large" : e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  const checked = unitValidation(body);
  if (checked.error) return fail(400, "validation_failed", checked.error);
  const { code, name, unitType, parentId } = checked.value;
  if (!parentId && unitType !== "company") return fail(400, "parent_required", "برای این نوع واحد باید واحد والد مشخص شود.");
  if (parentId) {
    const parent = await env.DB.prepare("SELECT id, unit_type, status FROM org_units WHERE id=?").bind(parentId).first();
    if (!parent || parent.status !== "active") return fail(400, "invalid_parent", "واحد والد وجود ندارد یا فعال نیست.");
    if (!ALLOWED_CHILD_TYPES[unitType].has(parent.unit_type)) return fail(400, "invalid_parent_type", "نوع واحد والد برای این ساختار مجاز نیست.");
  }
  if (!user.roles.includes("admin")) {
    if (!parentId || !await hasPermission(env,user,"org_unit","create",parentId)) return fail(403,"forbidden","ایجاد واحد فقط در محدوده سازمانی مجاز امکان‌پذیر است.");
  }
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO org_units (id, parent_id, code, name, unit_type, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, parentId, code, name, unitType, user.id),
      env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'org_unit.created', 'org_unit', ?, ?)")
        .bind(crypto.randomUUID(), user.id, id, JSON.stringify({ code, name, unit_type: unitType, parent_id: parentId }))
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: org_units\.code/i.test(String(error))) return fail(409, "duplicate_code", "کد واحد سازمانی قبلاً ثبت شده است.");
    return fail(500, "org_unit_create_failed", "ثبت واحد سازمانی انجام نشد.");
  }
  return json({ data: { id, parent_id: parentId, code, name, unit_type: unitType, status: "active" } }, 201);
}
async function updateOrgUnit(request, env, user, id) {
  let body;
  try { body = await readJson(request); } catch (e) {
    return fail(e.message === "too_large" ? 413 : 400, e.message === "too_large" ? "request_too_large" : e.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  if (Object.keys(body).some(key => !["name", "parent_id"].includes(key)))
    return fail(400, "validation_failed", "فقط نام و واحد والد قابل ویرایش هستند.");
  const existing = await env.DB.prepare("SELECT id, parent_id, code, name, unit_type, status FROM org_units WHERE id=?").bind(id).first();
  if (!existing) return fail(404, "org_unit_not_found", "واحد سازمانی پیدا نشد.");
  if (!await hasPermission(env,user,"org_unit","update",id)) return fail(403,"forbidden","ویرایش خارج از محدوده سازمانی مجاز نیست.");
  if (existing.status !== "active") return fail(409, "org_unit_inactive", "ابتدا واحد سازمانی را فعال کنید.");
  const name = body.name === undefined ? existing.name : String(body.name || "").trim();
  const parentId = body.parent_id === undefined ? existing.parent_id : (body.parent_id == null || body.parent_id === "" ? null : String(body.parent_id));
  if (!name || name.length > 120) return fail(400, "validation_failed", "نام واحد الزامی است و حداکثر ۱۲۰ نویسه دارد.");
  if (!parentId && existing.unit_type !== "company") return fail(400, "parent_required", "برای این نوع واحد باید واحد والد مشخص شود.");
  if (parentId) {
    const parent = await env.DB.prepare("SELECT id, unit_type, status FROM org_units WHERE id=?").bind(parentId).first();
    if (!parent || parent.status !== "active") return fail(400, "invalid_parent", "واحد والد وجود ندارد یا فعال نیست.");
    if (!ALLOWED_CHILD_TYPES[existing.unit_type].has(parent.unit_type)) return fail(400, "invalid_parent_type", "نوع واحد والد برای این ساختار مجاز نیست.");
    if (parentId === id) return fail(400, "hierarchy_cycle", "واحد نمی‌تواند والد خودش باشد.");
    const descendant = await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT id FROM org_units WHERE parent_id=?
        UNION ALL
        SELECT child.id FROM org_units child JOIN descendants d ON child.parent_id=d.id
      ) SELECT id FROM descendants WHERE id=? LIMIT 1`).bind(id, parentId).first();
    if (descendant) return fail(400, "hierarchy_cycle", "انتقال واحد به یکی از زیرمجموعه‌های خودش مجاز نیست.");
    if (!user.roles.includes("admin") && !await hasPermission(env,user,"org_unit","update",parentId)) return fail(403,"forbidden","انتقال واحد به خارج از محدوده سازمانی مجاز نیست.");
  }
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE org_units SET parent_id=?, name=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'")
        .bind(parentId, name, id),
      env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, 'org_unit.updated', 'org_unit', ?, ? WHERE changes()>0")
        .bind(crypto.randomUUID(), user.id, id, JSON.stringify({ parent_id: parentId, name }))
    ]);
    if (Number(results[0]?.meta?.changes || 0) === 0) return fail(409, "org_unit_changed", "واحد هم‌زمان تغییر کرده است؛ فهرست را تازه‌سازی کنید.");
  } catch {
    return fail(500, "org_unit_update_failed", "ویرایش واحد سازمانی انجام نشد.");
  }
  const updated = await env.DB.prepare(`SELECT u.id, u.parent_id, p.name AS parent_name, u.code, u.name, u.unit_type, u.status, u.created_at, u.updated_at
    FROM org_units u LEFT JOIN org_units p ON p.id=u.parent_id WHERE u.id=?`).bind(id).first();
  return json({ data: updated });
}
async function setOrgUnitStatus(env, user, id, nextStatus) {
  const existing = await env.DB.prepare("SELECT id, parent_id, code, name, unit_type, status FROM org_units WHERE id=?").bind(id).first();
  if (!existing) return fail(404, "org_unit_not_found", "واحد سازمانی پیدا نشد.");
  const permissionAction=nextStatus==="inactive"?"deactivate":"activate";
  if (!await hasPermission(env,user,"org_unit",permissionAction,id)) return fail(403,"forbidden","تغییر وضعیت خارج از محدوده سازمانی مجاز نیست.");
  if (existing.status === nextStatus) return json({ data: existing, meta: { changed: false } });
  if (nextStatus === "inactive") {
    const children = await env.DB.prepare("SELECT COUNT(*) AS count FROM org_units WHERE parent_id=? AND status='active'").bind(id).first();
    if (Number(children?.count || 0) > 0) return fail(409, "active_children_exist", "ابتدا واحدهای فعال زیرمجموعه را غیرفعال کنید.");
  } else if (existing.parent_id) {
    const parent = await env.DB.prepare("SELECT status FROM org_units WHERE id=?").bind(existing.parent_id).first();
    if (!parent || parent.status !== "active") return fail(409, "parent_inactive", "برای فعال‌سازی، ابتدا واحد والد را فعال کنید.");
  }
  const action = nextStatus === "inactive" ? "org_unit.deactivated" : "org_unit.activated";
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE org_units SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?")
        .bind(nextStatus, id, existing.status),
      env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, ?, 'org_unit', ?, ? WHERE changes()>0")
        .bind(crypto.randomUUID(), user.id, action, id, JSON.stringify({ code: existing.code, previous_status: existing.status, status: nextStatus }))
    ]);
    if (Number(results[0]?.meta?.changes || 0) === 0) return fail(409, "org_unit_changed", "وضعیت واحد هم‌زمان تغییر کرده است؛ فهرست را تازه‌سازی کنید.");
  } catch {
    return fail(500, "org_unit_status_failed", "تغییر وضعیت واحد سازمانی انجام نشد.");
  }
  const updated = await env.DB.prepare("SELECT id, parent_id, code, name, unit_type, status, updated_at FROM org_units WHERE id=?").bind(id).first();
  return json({ data: updated });
}
async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "GET" && url.pathname === "/api/health") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ data: { status: "ok", database: "connected" } });
    } catch { return fail(503, "database_unavailable", "پایگاه داده در دسترس نیست."); }
  }
  if (method === "GET" && url.pathname === "/api/v1/auth/status") {
    const state = await env.DB.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").first();
    return json({ data: { bootstrap_required: !state || !state.bootstrap_complete } });
  }
  if (method === "POST" && url.pathname === "/api/v1/auth/bootstrap") return bootstrap(request, env);
  if (method === "POST" && url.pathname === "/api/v1/auth/login") return login(request, env);
  if (method === "POST" && url.pathname === "/api/v1/auth/logout") {
    const token = cookieValue(request, COOKIE_NAME);
    const activeUser = token ? await sessionUser(request, env) : null;
    if (token) await env.DB.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL").bind(await sha256(token)).run();
    if (activeUser) await audit(env, activeUser.id, "auth.logout", "user", activeUser.id);
    return json({ data: { logged_out: true } }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  const user = await sessionUser(request, env);
  if (method === "GET" && url.pathname === "/api/v1/auth/me") {
    if (!user) return fail(401, "unauthenticated", "برای ادامه وارد سامانه شو.");
    return json({ data: user });
  }
  if (url.pathname === "/api/v1/org-units" && method === "GET") {
    if (!user) return fail(401, "unauthenticated", "برای مشاهده ساختار سازمانی وارد سامانه شو.");
    const result = user.roles.includes("admin")
      ? await env.DB.prepare(`SELECT u.id, u.parent_id, p.name AS parent_name, u.code, u.name, u.unit_type, u.status, u.created_at, u.updated_at
          FROM org_units u LEFT JOIN org_units p ON p.id=u.parent_id ORDER BY u.code LIMIT 1000`).all()
      : await (async()=>{
          if(!await hasPermission(env,user,"org_unit","read"))return null;
          const scopeExists=await env.DB.prepare("SELECT 1 FROM user_org_scopes WHERE user_id=? LIMIT 1").bind(user.id).first();
          if(!scopeExists)return null;
          return env.DB.prepare(`WITH RECURSIVE accessible(id) AS (
              SELECT org_unit_id FROM user_org_scopes WHERE user_id=?
              UNION
              SELECT child.id FROM org_units child JOIN accessible a ON child.parent_id=a.id
            )
            SELECT u.id,u.parent_id,p.name AS parent_name,u.code,u.name,u.unit_type,u.status,u.created_at,u.updated_at
            FROM org_units u LEFT JOIN org_units p ON p.id=u.parent_id AND p.id IN (SELECT id FROM accessible)
            WHERE u.id IN (SELECT id FROM accessible) ORDER BY u.code LIMIT 1000`).bind(user.id).all();
        })();
    if(!result)return fail(403,"forbidden","این حساب محدوده سازمانی برای مشاهده ندارد.");
    return json({ data: result.results, meta: { count: result.results.length } });
  }
  if (url.pathname === "/api/v1/org-units" && method === "POST") {
    if (!user) return fail(401, "unauthenticated", "برای ایجاد واحد سازمانی وارد سامانه شو.");
    return createOrgUnit(request, env, user);
  }
  if (url.pathname === "/api/v1/audit-events" && method === "GET") {
    if (!user) return fail(401, "unauthenticated", "برای مشاهده گزارش ممیزی وارد سامانه شو.");
    if (!await hasPermission(env, user, "audit", "read")) return fail(403, "forbidden", "مشاهده گزارش ممیزی مجاز نیست.");
    const rawLimit = url.searchParams.get("limit");
    const rawOffset = url.searchParams.get("offset");
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      return fail(400, "invalid_pagination", "limit باید ۱ تا ۱۰۰ و offset باید ۰ تا ۱۰۰۰۰ باشد.");
    }
    const result = await env.DB.prepare(`SELECT e.id, e.actor_user_id, u.email AS actor_email,
        e.action, e.entity_type, e.entity_id, e.metadata_json, e.created_at
      FROM audit_events e LEFT JOIN users u ON u.id=e.actor_user_id
      ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`).bind(limit + 1, offset).all();
    const hasMore = result.results.length > limit;
    const events = result.results.slice(0, limit).map(event => {
      let metadata = {};
      try { metadata = JSON.parse(event.metadata_json || "{}"); } catch { metadata = { invalid: true }; }
      return { ...event, metadata };
    });
    return json({ data: events, meta: { limit, offset, count: events.length, has_more: hasMore } });
  }
  if (url.pathname === "/api/v1/users" && method === "GET") {
    if (!user) return fail(401,"unauthenticated","برای مشاهده کاربران وارد سامانه شو.");
    return listUsers(env,user);
  }
  if (url.pathname === "/api/v1/users" && method === "POST") {
    if (!user) return fail(401,"unauthenticated","برای ایجاد کاربر وارد سامانه شو.");
    return createUser(request,env,user);
  }
  const userAccessRoute=url.pathname.match(new RegExp("^/api/v1/users/([^/]+)$"));
  if(userAccessRoute&&method==="PATCH"){
    if(!user)return fail(401,"unauthenticated","برای ویرایش دسترسی کاربر وارد سامانه شو.");
    return updateUserAccess(request,env,user,userAccessRoute[1]);
  }
  const userRoute=url.pathname.match(new RegExp("^/api/v1/users/([^/]+)/(activate|deactivate)$"));
  if(userRoute&&method==="POST"){
    if(!user)return fail(401,"unauthenticated","برای تغییر وضعیت کاربر وارد سامانه شو.");
    return setUserStatus(env,user,userRoute[1],userRoute[2]==="activate"?"active":"disabled");
  }
  const unitRoute = url.pathname.match(new RegExp("^/api/v1/org-units/([^/]+)(?:/(activate|deactivate))?$"));
  if (unitRoute) {
    if (!user) return fail(401, "unauthenticated", "برای ادامه وارد سامانه شو.");
    const [, id, action] = unitRoute;
    if (method === "PATCH" && !action) return updateOrgUnit(request, env, user, id);
    if (method === "POST" && action) return setOrgUnitStatus(env, user, id, action === "activate" ? "active" : "inactive");
  }
  return fail(404, "not_found", "مسیر API پیدا نشد.");
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("x-content-type-options", "nosniff");
      headers.set("referrer-policy", "strict-origin-when-cross-origin");
      headers.set("x-frame-options", "DENY");
      headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
      headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const cors = corsHeaders(request, env);
    if (cors === null) return fail(403, "origin_denied", "مبدأ درخواست مجاز نیست.");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      ...cors, "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Bootstrap-Secret",
      "access-control-max-age": "600"
    }});
    try {
      const response = await route(request, env);
      if (!Object.keys(cors).length) return response;
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch {
      return fail(500, "internal_error", "خطای داخلی رخ داد؛ اطلاعات حساس در پاسخ نمایش داده نمی‌شود.");
    }
  }
};
