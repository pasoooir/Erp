# Passkey authentication on Cloudflare Workers Free

## Goal

Avoid password KDF work on every login and during first-admin creation. WebAuthn authenticators retain the private key; the Worker stores only a credential ID, public key, signature counter, and transport metadata. The server verifies signed challenges with Web Crypto through `@simplewebauthn/server`.

## Implemented in this branch

- D1 migration `0004_passkey_auth.sql`: credential and short-lived challenge tables.
- `src/modules/auth/passkey/passkey-handler.js`: one-time first-admin Passkey bootstrap, authenticated Passkey enrollment, and Passkey login/verification.
- API routes:
  - `POST /api/v1/auth/passkey/bootstrap/options`
  - `POST /api/v1/auth/passkey/bootstrap/verify`
  - `POST /api/v1/auth/passkeys/register/options`
  - `POST /api/v1/auth/passkeys/register/verify`
  - `GET /api/v1/auth/passkey/options?identifier=<username-or-email>`
  - `POST /api/v1/auth/passkey/verify`
- First-admin form and ERP login support browser-native WebAuthn; signed-in users can enroll additional Passkeys.
- RP ID/origin default to `pasoooir.github.io` / `https://pasoooir.github.io`. Local CI overrides them to the local Wrangler origin.
- Worker compatibility includes `nodejs_compat`. Cloudflare Workers Free applies its platform-default 10 ms CPU limit; do not set `limits.cpu_ms` in Wrangler because explicit CPU limits are unsupported on the Free plan.

## Security properties

- Registration and login challenges expire after five minutes and are consumed once.
- Registration and login require user verification.
- Attestation is `none`; accepted credential algorithms are ES256 and RS256.
- Expected origin and RP ID are fixed server-side configuration, not accepted from request bodies.
- Credentials are bound to an existing user; login checks account status and validates the authenticator counter.
- Session creation continues to use the existing random opaque token, SHA-256 token hash in D1, HttpOnly/Secure cookie, and server-side RBAC.

## Migration / compatibility caveat

This is an additive rollout. Existing password accounts and the legacy password login endpoint remain available during enrollment migration; this branch does **not** yet remove PBKDF2 from the legacy path or convert existing users automatically. New first-admin setup uses Passkeys. Before claiming the entire authentication system is Free-tier-ready, user provisioning must become passwordless/invitation-based and every existing active user must enroll a Passkey or receive a secure recovery enrollment flow. Only then can the password endpoint and PBKDF2 code be retired.

## Validation required before production

1. Run the ERP foundation CI and local Cloudflare runtime smoke, including a virtual WebAuthn authenticator.
2. Measure registration and login verification on the Free plan and confirm execution fits the platform-default 10 ms CPU allowance; explicit `limits.cpu_ms` configuration is intentionally omitted for Free-plan compatibility.
3. Test replay, expired challenge, wrong origin/RP ID, invalid signature, disabled user, counter rollback, and concurrent bootstrap.
4. Apply migration only to a disposable D1 database.
5. Verify the exact production Pages origin and RP ID before deployment.

No production D1 migration, Worker deployment, secret change, or production data mutation is authorized by this branch.
