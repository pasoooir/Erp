import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .split("=").join("").split("+").join("-").split("/").join("_");
const fromB64url = (value) => Uint8Array.from(
  atob(String(value).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - String(value).length % 4) % 4)),
  (char) => char.charCodeAt(0),
);
const RP_NAME = "ERP سازمانی";
const CHALLENGE_TTL_MINUTES = 5;
const rpConfig = (env) => ({
  rpID: env.WEBAUTHN_RP_ID || "pasoooir.github.io",
  origin: env.WEBAUTHN_ORIGIN || "https://pasoooir.github.io",
});
const parseBody = async (request, readJson, fail) => {
  try { return await readJson(request); }
  catch (error) { return fail(400, "invalid_json", "درخواست معتبر نیست."); }
};
async function storeChallenge(DB, challenge, purpose, userId, metadata = {}) {
  await DB.prepare("DELETE FROM auth_challenges WHERE expires_at<=CURRENT_TIMESTAMP").run();
  await DB.prepare(`INSERT INTO auth_challenges (challenge, purpose, user_id, metadata_json, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', ?))`)
    .bind(challenge, purpose, userId || null, JSON.stringify(metadata), `+${CHALLENGE_TTL_MINUTES} minutes`).run();
}
async function takeChallenge(DB, challenge, purpose, userId = null) {
  // A single DELETE ... RETURNING makes challenge consumption atomic. A SELECT
  // followed by DELETE would allow two concurrent requests to verify one challenge.
  return DB.prepare(`DELETE FROM auth_challenges
    WHERE challenge=? AND purpose=? AND expires_at>CURRENT_TIMESTAMP
      AND (? IS NULL OR user_id=?)
    RETURNING challenge, user_id, metadata_json`)
    .bind(challenge, purpose, userId, userId).first();
}
const safeUsername = (value) => String(value || "").trim().toLowerCase();
const safeEmail = (value) => String(value || "").trim().toLowerCase();

export async function passkeyBootstrapOptions(request, env, deps) {
  const { fail, json, readJson, normalizeEmail, normalizeUsername, validEmail, validUsername } = deps;
  if (!env.BOOTSTRAP_SECRET || env.BOOTSTRAP_SECRET.length < 32 ||
      !deps.safeEqual(request.headers.get("x-bootstrap-secret") || "", env.BOOTSTRAP_SECRET)) {
    return fail(403, "bootstrap_denied", "کلید راه‌اندازی معتبر نیست.");
  }
  const state = await env.DB.prepare("SELECT bootstrap_complete FROM system_state WHERE id=1").first();
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (!state || state.bootstrap_complete || Number(existing?.count || 0) !== 0)
    return fail(409, "bootstrap_already_completed", "راه‌اندازی اولیه قبلاً انجام شده است.");
  const body = await parseBody(request, readJson, fail);
  if (body instanceof Response) return body;
  const email = normalizeEmail(body.email);
  const username = normalizeUsername(body.username || email.split("@")[0]);
  const displayName = String(body.display_name || "").trim();
  if (!validEmail(email) || !validUsername(username) || !displayName || displayName.length > 120)
    return fail(400, "validation_failed", "نام کاربری، ایمیل یا نام نمایشی معتبر نیست.");
  const { rpID } = rpConfig(env);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID, userName: username, userDisplayName: displayName,
    userID: crypto.getRandomValues(new Uint8Array(32)),
    attestationType: "none", supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storeChallenge(env.DB, options.challenge, "bootstrap", null, { email, username, displayName });
  return json({ data: options });
}

export async function passkeyBootstrapVerify(request, env, deps) {
  const { fail, json, readJson, safeEqual, createSession, audit } = deps;
  if (!env.BOOTSTRAP_SECRET || !safeEqual(request.headers.get("x-bootstrap-secret") || "", env.BOOTSTRAP_SECRET))
    return fail(403, "bootstrap_denied", "کلید راه‌اندازی معتبر نیست.");
  const body = await parseBody(request, readJson, fail);
  if (body instanceof Response) return body;
  const response = body.response;
  const challenge = String(body.challenge || "");
  if (!response || !challenge) return fail(400, "invalid_response", "پاسخ Passkey ناقص است.");
  const challengeRow = await takeChallenge(env.DB, challenge, "bootstrap");
  if (!challengeRow) return fail(400, "challenge_expired", "درخواست ثبت منقضی شده یا قبلاً استفاده شده است.");
  const metadata = JSON.parse(challengeRow.metadata_json || "{}");
  const { rpID, origin } = rpConfig(env);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
      requireUserVerification: true, supportedAlgorithmIDs: [-7, -257],
    });
  } catch (error) {
    console.error("auth.passkey_registration_verification_failed", { name: error?.name || "Error", message: String(error?.message || "unknown").slice(0, 180) });
    return fail(400, "passkey_verification_failed", "اعتبارسنجی Passkey ناموفق بود.");
  }
  if (!verification.verified || !verification.registrationInfo)
    return fail(400, "passkey_verification_failed", "ثبت Passkey تأیید نشد.");
  const credential = verification.registrationInfo.credential;
  const id = crypto.randomUUID();
  const placeholder = "passkey-only$" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  try {
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE system_state SET bootstrap_complete=1 WHERE id=1 AND bootstrap_complete=0"),
      env.DB.prepare(`INSERT INTO users (id, username, email, display_name, password_hash)
        SELECT ?, ?, ?, ?, ? WHERE (SELECT bootstrap_complete FROM system_state WHERE id=1)=1
        AND NOT EXISTS (SELECT 1 FROM users)`).bind(id, metadata.username, metadata.email, metadata.displayName, placeholder),
      env.DB.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name='admin' AND EXISTS (SELECT 1 FROM users WHERE id=?)").bind(id, id),
      env.DB.prepare(`INSERT INTO webauthn_credentials (credential_id,user_id,public_key,counter,transports_json,device_type,backed_up)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)`)
        .bind(credential.id, id, b64url(credential.publicKey), credential.counter,
          JSON.stringify(credential.transports || []), verification.registrationInfo.credentialDeviceType,
          verification.registrationInfo.credentialBackedUp ? 1 : 0, id),
      env.DB.prepare(`INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json)
        SELECT ?, ?, 'auth.passkey_bootstrap_completed','user',?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)`)
        .bind(crypto.randomUUID(), id, id, JSON.stringify({ credential_id: credential.id }), id),
    ]);
    if (Number(result[1]?.meta?.changes || 0) !== 1)
      return fail(409, "bootstrap_already_completed", "راه‌اندازی اولیه هم‌زمان توسط درخواست دیگری تکمیل شده است.");
  } catch (error) {
    console.error("auth.passkey_bootstrap_database_failed", { name: error?.name || "Error" });
    return fail(500, "bootstrap_failed", "ایجاد مدیر اولیه انجام نشد.");
  }
  const token = await createSession(id, env);
  await audit(env, id, "auth.login", "user", id, { method: "passkey" });
  return json({ data: { id, username: metadata.username, email: metadata.email, display_name: metadata.displayName, roles: ["admin"] } }, 201,
    { "set-cookie": deps.sessionCookie(token) });
}

export async function passkeyRegistrationOptions(request, env, user, deps) {
  const { json } = deps;
  const { rpID } = rpConfig(env);
  const existing = await env.DB.prepare("SELECT credential_id,transports_json FROM webauthn_credentials WHERE user_id=?").bind(user.id).all();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID, userName: user.username || user.email,
    userDisplayName: user.display_name || user.username || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none", supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: existing.results.map((item) => ({
      id: item.credential_id,
      transports: JSON.parse(item.transports_json || "[]"),
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await storeChallenge(env.DB, options.challenge, "register", user.id);
  return json({ data: options });
}

export async function passkeyRegistrationVerify(request, env, user, deps) {
  const { fail, json, readJson } = deps;
  const body = await parseBody(request, readJson, fail);
  if (body instanceof Response) return body;
  const challenge = String(body.challenge || "");
  if (!challenge || !body.response) return fail(400, "invalid_response", "پاسخ Passkey ناقص است.");
  const row = await takeChallenge(env.DB, challenge, "register", user.id);
  if (!row) return fail(400, "challenge_expired", "درخواست ثبت منقضی شده یا قبلاً استفاده شده است.");
  const { rpID, origin } = rpConfig(env);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response, expectedChallenge: challenge, expectedOrigin: origin,
      expectedRPID: rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257],
    });
  } catch {
    return fail(400, "passkey_verification_failed", "اعتبارسنجی Passkey ناموفق بود.");
  }
  if (!verification.verified || !verification.registrationInfo)
    return fail(400, "passkey_verification_failed", "ثبت Passkey تأیید نشد.");
  const credential = verification.registrationInfo.credential;
  try {
    await env.DB.prepare(`INSERT INTO webauthn_credentials
      (credential_id,user_id,public_key,counter,transports_json,device_type,backed_up)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(credential.id, user.id, b64url(credential.publicKey), credential.counter,
        JSON.stringify(credential.transports || []), verification.registrationInfo.credentialDeviceType,
        verification.registrationInfo.credentialBackedUp ? 1 : 0).run();
  } catch {
    return fail(409, "passkey_already_registered", "این Passkey قبلاً ثبت شده است.");
  }
  return json({ data: { registered: true, credential_id: credential.id } }, 201);
}

export async function passkeyAuthenticationOptions(request, env, deps) {
  const { fail, json, normalizeEmail, normalizeUsername } = deps;
  const url = new URL(request.url);
  const identifier = String(url.searchParams.get("identifier") || "").trim();
  if (!identifier || identifier.length > 254) return fail(400, "identifier_required", "نام کاربری یا ایمیل را وارد کنید.");
  const normalized = identifier.includes("@") ? normalizeEmail(identifier) : normalizeUsername(identifier);
  const user = await env.DB.prepare(`SELECT id FROM users WHERE (username=? COLLATE NOCASE OR email=? COLLATE NOCASE) AND status='active' LIMIT 1`)
    .bind(normalized, normalized).first();
  if (!user) return fail(404, "passkey_unavailable", "برای این حساب Passkey ثبت نشده است.");
  const credentials = await env.DB.prepare("SELECT credential_id,transports_json FROM webauthn_credentials WHERE user_id=?").bind(user.id).all();
  if (!credentials.results.length) return fail(404, "passkey_unavailable", "برای این حساب Passkey ثبت نشده است.");
  const { rpID } = rpConfig(env);
  const options = await generateAuthenticationOptions({
    rpID, allowCredentials: credentials.results.map((item) => ({
      id: item.credential_id, transports: JSON.parse(item.transports_json || "[]"),
    })), userVerification: "required",
  });
  await storeChallenge(env.DB, options.challenge, "login", user.id);
  return json({ data: { ...options, challengeId: options.challenge } });
}

export async function passkeyAuthenticationVerify(request, env, deps) {
  const { fail, json, readJson, createSession, sessionCookie, audit } = deps;
  const body = await parseBody(request, readJson, fail);
  if (body instanceof Response) return body;
  const challenge = String(body.challenge || "");
  const response = body.response;
  if (!challenge || !response?.id) return fail(400, "invalid_response", "پاسخ Passkey ناقص است.");
  const row = await takeChallenge(env.DB, challenge, "login");
  if (!row?.user_id) return fail(400, "challenge_expired", "درخواست ورود منقضی شده یا قبلاً استفاده شده است.");
  const credential = await env.DB.prepare(`SELECT c.credential_id,c.public_key,c.counter,c.transports_json,u.id,u.username,u.email,u.display_name,u.status
    FROM webauthn_credentials c JOIN users u ON u.id=c.user_id
    WHERE c.credential_id=? AND c.user_id=? LIMIT 1`).bind(response.id, row.user_id).first();
  if (!credential || credential.status !== "active") return fail(401, "invalid_passkey", "Passkey معتبر نیست.");
  const { rpID, origin } = rpConfig(env);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: {
        id: credential.credential_id, publicKey: fromB64url(credential.public_key),
        counter: Number(credential.counter), transports: JSON.parse(credential.transports_json || "[]"),
      },
      requireUserVerification: true,
    });
  } catch {
    return fail(401, "invalid_passkey", "اعتبارسنجی Passkey ناموفق بود.");
  }
  if (!verification.verified) return fail(401, "invalid_passkey", "اعتبارسنجی Passkey ناموفق بود.");
  const counterUpdate = await env.DB.prepare("UPDATE webauthn_credentials SET counter=?, last_used_at=CURRENT_TIMESTAMP WHERE credential_id=? AND counter=?")
    .bind(verification.authenticationInfo.newCounter, credential.credential_id, credential.counter).run();
  if (Number(counterUpdate.meta?.changes || 0) !== 1) return fail(401, "passkey_replayed", "اعتبارنامه قبلاً استفاده شده یا هم‌زمان تغییر کرده است.");
  const roles = await env.DB.prepare("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?").bind(credential.id).all();
  const token = await createSession(credential.id, env);
  await audit(env, credential.id, "auth.login", "user", credential.id, { method: "passkey" });
  return json({ data: { id: credential.id, username: credential.username, email: credential.email,
    display_name: credential.display_name, roles: roles.results.map((item) => item.name) } }, 200,
    { "set-cookie": sessionCookie(token) });
}
