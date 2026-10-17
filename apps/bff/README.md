# MMS BFF

This is the first authentication foundation for the production security rollout. It implements OIDC Authorization Code with PKCE, opaque Redis-backed sessions, a same-origin session endpoint, CSRF-protected logout and API writes, and bounded idle/absolute session lifetime. It also proxies the eight web API prefixes to their corresponding private services.

The OIDC issuer is configured through environment variables, so this code does not depend on a specific identity provider. Register `OIDC_REDIRECT_URI` as an exact callback URL at the selected provider. Configure the provider for Authorization Code flow, `openid profile email` scopes, and PKCE S256. Configure it to issue the `OIDC_EMPLOYEE_ID_CLAIM` in the ID token with the employee's stable MMS UUID, and require MFA. Production requires HTTPS and a random `SESSION_SECRET` with at least 32 characters. Do not use the example values as secrets.

## Run

For local development, create a local RSA key pair for BFF-to-service assertions (the ignored `.local-security` directory is local-only):

```sh
mkdir -p .local-security
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out .local-security/bff-private.pem
openssl pkey -in .local-security/bff-private.pem -pubout -out .local-security/bff-public.pem
chmod 600 .local-security/bff-private.pem
```

Start the usual dev dependencies with `pnpm infra:up`, then start the local OIDC provider with `docker compose --profile oidc-dev up -d keycloak`. The Keycloak container is bound to loopback and imports a development-only realm with a test account and employee UUID. Copy `apps/bff/.env.development.example` to `apps/bff/.env` and `services/financials/.env.example` to `services/financials/.env`; their local key paths refer to the generated pair. Then run:

```sh
pnpm --filter @mms/bff dev
```

The local Redis container is published on `127.0.0.1:6380` (container port 6379), and Keycloak on `127.0.0.1:8180` (container port 8080) to avoid common host port conflicts. The BFF permits the local Keycloak HTTP issuer only when `NODE_ENV=development`; production configuration requires an HTTPS issuer. Open `http://localhost:5173` and sign in as `mms-dev` with password `mms-local-dev-password-only`. Keycloak's local admin console is at `http://localhost:8180/admin/` (`admin` / `mms-local-admin-only`). These credentials and the imported realm are for local development only; never expose this Keycloak configuration to the internet or reuse its credentials in a deployed environment. The realm is imported only when first created, so deleting its local Keycloak data volume is required to re-import changes to the JSON file.

Available endpoints:

- `GET /health` — liveness only.
- `GET /ready` — verifies Redis and OIDC discovery.
- `GET /auth/login` — starts OIDC login.
- `GET /auth/callback` — validates state, nonce, and PKCE; stores tokens server-side and rotates the session ID.
- `GET /auth/session` — returns the signed-in subject and a session CSRF token.
- `POST /auth/logout` — destroys the server-side session; requires matching Origin and `X-CSRF-Token`.
- `/api/vendor/*`, `/api/inventory/*`, `/api/procurement/*`, `/api/receiving/*`, `/api/warehouse-operations/*`, `/api/retail-sales/*`, `/api/sales-audit/*`, `/api/financials/*` — authenticated same-origin API proxy; rewrites to service `/api/v1`, drops browser credentials/identity headers, and derives actor fields from the verified employee claim.

The BFF signs short-lived, service-audience-specific assertions with its private RSA key. The Financials API verifies the signature, issuer, audience, expiry, HTTP method, request path, and matching actor ID before allowing `/api/v1` traffic. The other seven APIs do not yet verify these assertions. Financials also does **not** yet map users to permissions or enforce domain authorization. Keep every service private and reachable only from the BFF and trusted workloads; this is incremental defense in depth, not a production release gate. Do not expose service ports or the development Compose stack to the internet.

For a reverse proxy in front, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops. Never trust client-supplied forwarded headers through an untrusted hop. Use Redis over a private network (TLS for connections that leave the host); Redis is required and the BFF fails to start if it cannot connect.

The development Compose file's Redis and optional Keycloak services are loopback-bound and intended only for local work. Keycloak runs in development mode and is not a production identity-provider deployment. Production should use the customer-selected managed OIDC provider or a separately hardened Keycloak deployment, inject a private Redis URL and secrets from the VPS secret-management approach, provision the BFF signing private key separately from the API verification public key, and set all eight API URLs to private service endpoints. Never reuse the local key pair in production.

## Manual identity-provider setup

At the selected OIDC provider, create a confidential web client for MMS. Enable Authorization Code flow and PKCE S256, allow only the exact callback URI in `OIDC_REDIRECT_URI`, and issue `employee_id` (or the configured claim name) in the ID token. That claim must be a valid UUID that MMS can store as its employee audit actor. Enable MFA according to the organization's policy. Copy the issuer URL, client ID, and client secret into the BFF runtime environment. Never place the client secret in the web app's `VITE_*` variables.
