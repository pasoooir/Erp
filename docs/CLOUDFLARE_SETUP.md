# Cloudflare test connection setup

This repository can run a **manual, read-only connectivity smoke test** from GitHub Actions. It does not deploy a Worker, migrate the application database, or write to production data.

## Verified test resource

A dedicated test database was created through the connected Cloudflare API on 2026-10-28:

- Name: `erp-connectivity-test-20261028`
- Database UUID: `a8d8240e-190f-491f-a009-9cc47a085f90`
- Jurisdiction: EU
- Region reported by Cloudflare: EEUR
- Test table: `connectivity_probe`
- Test marker: `github-cloudflare-api-ok`

The table was created and a parameterized SELECT returned the expected marker. This confirms the current ChatGPT Cloudflare connector can authenticate, create a D1 database, execute SQL, and read the result. It does **not** yet prove GitHub Actions has Cloudflare credentials.

## One-time GitHub configuration

A repository owner must add the following settings in **GitHub → pasoooir/Erp → Settings → Secrets and variables → Actions**:

1. Add repository variable `CLOUDFLARE_ACCOUNT_ID` with the account ID from Cloudflare. The currently connected account ID is `375ca865a8f1a55b88293afdf286d2fe`.
2. Add repository secret `CLOUDFLARE_API_TOKEN` containing the Cloudflare API token created by the repository owner.

Token configuration reported by the repository owner:
- A custom Cloudflare API token with broad access intended to manage the ERP's Cloudflare resources has been created and stored as the GitHub secret above.
- The exact permission groups and their effective API access have not yet been independently verified by this workflow.
- Do not use the Global API Key. Never commit the token to a file, issue, workflow YAML, or log. GitHub secret values are write-only after saving.
- Keep the token value private and avoid exposing it to workflows that execute untrusted code. Broad credentials increase the impact of a compromised workflow; use protected branches/environments and separate test/production controls.

Do not paste the token into ChatGPT messages.

## Run the smoke test

After adding the variable and secret:

1. Open **Actions → Cloudflare connectivity smoke test**.
2. Choose **Run workflow**.
3. Keep the default database UUID unless intentionally testing another disposable D1 database.
4. Confirm both steps pass: listing D1 databases and reading the known probe marker.

The workflow never prints the token. It only prints database names, UUIDs, and jurisdiction. Do not use this test workflow with a production database unless you deliberately want to grant the workflow read access to it.

## Current status and boundaries

- ChatGPT's Cloudflare connector: verified against a newly created D1 test database.
- GitHub repository connection: verified; the repository is `pasoooir/Erp`.
- GitHub Actions → Cloudflare: **not yet verified**; it requires the human-managed GitHub variable and secret above, then a manual workflow run.
- Worker deployment, production DB migration, and production data changes are intentionally out of scope.
