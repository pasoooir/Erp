export async function authenticateWithPassword(request, env, deps) {
  const { readJson, fail, normalizeEmail, normalizeUsername, validEmail, validUsername, validPassword, sha256, verifyPassword, createSession, audit, json, sessionCookie, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MINUTES } = deps;
  let body;
  try { body = await readJson(request); } catch (error) {
    return fail(400, error.message === "too_large" ? "request_too_large" : error.message === "content_type" ? "content_type_required" : "invalid_json", "درخواست معتبر نیست.");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  const rawIdentifier = body.identifier ?? body.username ?? body.email;
  const identifier = String(rawIdentifier || "").trim();
  const password = body.password;
  const emailLogin = identifier.includes("@");
  const normalized = emailLogin ? normalizeEmail(identifier) : normalizeUsername(identifier);
  if (!(emailLogin ? validEmail(normalized) : validUsername(normalized)) || typeof password !== "string" || password.length > 128)
    return fail(400, "validation_failed", "نام کاربری یا رمز عبور معتبر نیست.");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const attemptKey = await sha256(`${normalized}|${ip}`);
  const attempts = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE attempt_key=? AND attempted_at > datetime('now', ?)")
    .bind(attemptKey, `-${LOGIN_WINDOW_MINUTES} minutes`).first();
  if (Number(attempts?.count || 0) >= MAX_LOGIN_ATTEMPTS) return fail(429, "login_rate_limited", "تلاش‌های ورود بیش از حد است؛ بعداً دوباره تلاش کنید.");
  const user = await env.DB.prepare("SELECT id, username, email, display_name, password_hash, status FROM users WHERE (username=? COLLATE NOCASE OR email=? COLLATE NOCASE) LIMIT 1")
    .bind(normalized, normalized).first();
  const valid = user && user.status === "active" && await verifyPassword(password, user.password_hash);
  if (!valid) {
    await env.DB.prepare("INSERT INTO login_attempts (attempt_key) VALUES (?)").bind(attemptKey).run();
    return fail(401, "invalid_credentials", "نام کاربری یا رمز عبور نادرست است.");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const roles = await env.DB.prepare("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?").bind(user.id).all();
  const token = await createSession(user.id, env);
  await audit(env, user.id, "auth.login", "user", user.id);
  return json({ data: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, roles: roles.results.map(row => row.name) } }, 200, { "set-cookie": sessionCookie(token) });
}
