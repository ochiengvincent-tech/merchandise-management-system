import "dotenv/config";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import { createClient } from "redis";
import { z } from "zod";
import { env } from "./config.js";
import { getOidcConfiguration, oidc } from "./oidc.js";
import { signJwtRs256 } from "@mms/security";

const bffAssertionPrivateKey = readFileSync(env.BFF_ASSERTION_PRIVATE_KEY_PATH, "utf8");

const redis = createClient({ url: env.REDIS_URL });
redis.on("error", () => console.error("BFF session store connection error"));

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
app.use(session({
  name: env.SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  store: new RedisStore({ client: redis, prefix: "mms:bff:session:" }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_IDLE_MS,
  },
}));

app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "bff" }));
app.get("/ready", async (_req, res) => {
  try {
    await redis.ping();
    await getOidcConfiguration();
    return res.status(200).json({ status: "ready", service: "bff" });
  } catch (error) {
    logBffError("Readiness check failed", error);
    return res.status(503).json({ status: "not_ready", service: "bff" });
  }
});

app.get("/auth/login", async (req, res, next) => {
  try {
    const configuration = await getOidcConfiguration();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    req.session.oidcTransaction = { state, nonce, codeVerifier, createdAt: Date.now() };
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));

    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: env.OIDC_REDIRECT_URI,
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return res.redirect(302, authorizationUrl.href);
  } catch (error) {
    return next(error);
  }
});

app.get("/auth/callback", async (req, res, next) => {
  const transaction = req.session.oidcTransaction;
  delete req.session.oidcTransaction;
  if (!transaction || Date.now() - transaction.createdAt > 10 * 60 * 1000) {
    return res.status(400).json({ error: { message: "The sign-in request expired. Please try again." } });
  }

  try {
    const configuration = await getOidcConfiguration();
    const currentUrl = new URL(req.originalUrl, env.PUBLIC_ORIGIN);
    const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub) return res.status(401).json({ error: { message: "Sign-in could not be verified." } });
    const employeeId = z.uuid().safeParse(claims[env.OIDC_EMPLOYEE_ID_CLAIM]);
    if (!employeeId.success) {
      return res.status(403).json({ error: { message: "Your identity is not mapped to an MMS employee account." } });
    }

    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.identity = {
      subject: claims.sub,
      employeeId: employeeId.data,
      email: typeof claims.email === "string" ? claims.email : undefined,
      displayName: typeof claims.name === "string" ? claims.name : undefined,
      authenticatedAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    req.session.oidcTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    };
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    return res.redirect(303, "/");
  } catch (error) {
    return next(error);
  }
});

function requireIdentity(req: Request, res: Response, next: NextFunction) {
  const identity = req.session.identity;
  if (!identity) return res.status(401).json({ error: { message: "Authentication required." } });

  const now = Date.now();
  if (now - identity.lastSeenAt > env.SESSION_IDLE_MS || now - identity.authenticatedAt > env.SESSION_MAX_AGE_MS) {
    req.session.destroy(() => undefined);
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/", secure: env.SESSION_COOKIE_SECURE, httpOnly: true, sameSite: "lax" });
    return res.status(401).json({ error: { message: "Session expired. Please sign in again." } });
  }
  identity.lastSeenAt = now;
  next();
}

app.get("/auth/session", requireIdentity, (req, res) => {
  const identity = req.session.identity!;
  const csrfToken = req.session.csrfToken ?? randomBytes(32).toString("base64url");
  req.session.csrfToken = csrfToken;
  return res.json({
    authenticated: true,
    user: { subject: identity.subject, employeeId: identity.employeeId, email: identity.email, displayName: identity.displayName },
    csrfToken,
  });
});

function requireSameOriginAndCsrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const csrfToken = req.get("x-csrf-token");
  const expected = req.session.csrfToken;
  const csrfBuffer = csrfToken ? Buffer.from(csrfToken) : Buffer.alloc(0);
  const expectedBuffer = expected ? Buffer.from(expected) : Buffer.alloc(0);
  const tokenMatches = Boolean(csrfToken && expected && csrfBuffer.length === expectedBuffer.length && timingSafeEqual(csrfBuffer, expectedBuffer));
  if (origin !== env.PUBLIC_ORIGIN || !tokenMatches) {
    return res.status(403).json({ error: { message: "Request origin or CSRF token is invalid." } });
  }
  return next();
}

app.post("/auth/logout", requireIdentity, requireSameOriginAndCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/", secure: env.SESSION_COOKIE_SECURE, httpOnly: true, sameSite: "lax" });
    return res.status(204).end();
  });
});

const apiRoutes = [
  { prefix: "/api/vendor", target: env.VENDOR_API_URL, audience: "vendor-management" },
  { prefix: "/api/inventory", target: env.INVENTORY_API_URL, audience: "inventory" },
  { prefix: "/api/procurement", target: env.PROCUREMENT_API_URL, audience: "procurement" },
  { prefix: "/api/receiving", target: env.RECEIVING_API_URL, audience: "receiving" },
  { prefix: "/api/warehouse-operations", target: env.WAREHOUSE_API_URL, audience: "warehouse-operations" },
  { prefix: "/api/retail-sales", target: env.RETAIL_SALES_API_URL, audience: "retail-sales" },
  { prefix: "/api/sales-audit", target: env.SALES_AUDIT_API_URL, audience: "sales-audit" },
  { prefix: "/api/financials", target: env.FINANCIALS_API_URL, audience: "financials" },
] as const;

function routeForRequest(req: Request) {
  const pathname = new URL(req.originalUrl, env.PUBLIC_ORIGIN).pathname;
  return apiRoutes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function replaceActorFields(value: unknown, employeeId: string): void {
  if (Array.isArray(value)) {
    for (const item of value) replaceActorFields(item, employeeId);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (["actorId", "approverId", "createdBy", "requestedBy", "receivedBy", "openedBy", "submittedBy"].includes(key)) {
      (value as Record<string, unknown>)[key] = employeeId;
    } else {
      replaceActorFields(child, employeeId);
    }
  }
}

function requireJsonForWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.is("application/json")) {
    return res.status(415).json({ error: { message: "API write requests must use application/json." } });
  }
  return next();
}

const apiProxy = createProxyMiddleware({
  target: "http://127.0.0.1",
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: 30_000,
  timeout: 30_000,
  router: (incomingRequest) => {
    const route = routeForRequest(incomingRequest as Request);
    if (!route) throw new Error("Unknown API route");
    return route.target;
  },
  pathRewrite: (_path, incomingRequest) => {
    const req = incomingRequest as Request;
    const route = routeForRequest(req);
    if (!route) return "/__invalid_api_route__";
    const url = new URL(req.originalUrl, env.PUBLIC_ORIGIN);
    return `/api/v1${url.pathname.slice(route.prefix.length)}${url.search}`;
  },
  on: {
    proxyReq: (proxyRequest, incomingRequest) => {
      const req = incomingRequest as Request;
      const employeeId = req.session.identity?.employeeId;
      if (!employeeId) {
        proxyRequest.destroy(new Error("Authenticated employee context is missing"));
        return;
      }

      for (const header of ["cookie", "authorization", "origin", "referer", "x-csrf-token", "x-user-id", "x-authenticated-user", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"]) {
        proxyRequest.removeHeader(header);
      }
      for (const header of proxyRequest.getHeaderNames()) {
        if (header.startsWith("x-mms-")) proxyRequest.removeHeader(header);
      }

      const route = routeForRequest(req);
      if (!route) {
        proxyRequest.destroy(new Error("Authenticated API route is missing"));
        return;
      }
      const issuedAt = Math.floor(Date.now() / 1000);
      const assertion = signJwtRs256({
        iss: "mms-bff",
        aud: route.audience,
        sub: employeeId,
        iat: issuedAt,
        exp: issuedAt + 30,
        jti: randomUUID(),
        htm: proxyRequest.method,
        htu: proxyRequest.path,
      }, bffAssertionPrivateKey);
      proxyRequest.setHeader("x-mms-bff-assertion", assertion);
      proxyRequest.setHeader("x-actor-id", employeeId);

      replaceActorFields(req.body, employeeId);
      fixRequestBody(proxyRequest, req);
    },
    proxyRes: (proxyResponse) => {
      delete proxyResponse.headers["set-cookie"];
      delete proxyResponse.headers["x-powered-by"];
      proxyResponse.headers["cache-control"] = "no-store";
      proxyResponse.headers["x-content-type-options"] = "nosniff";
      proxyResponse.headers["x-frame-options"] = "DENY";
      proxyResponse.headers["referrer-policy"] = "no-referrer";
      proxyResponse.headers["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
    },
  },
});

app.use("/api", (req, res, next) => {
  if (!routeForRequest(req)) return res.status(404).json({ error: { message: "API route not found." } });
  return next();
});
app.use("/api", requireIdentity, requireSameOriginAndCsrf, requireJsonForWrites, express.json({ limit: "1mb" }), apiProxy);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logBffError("BFF request failed", error);
  if (res.headersSent) return res.end();
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const message = status === 413 ? "Request body is too large." : status < 500 ? "Request could not be processed." : "An internal error occurred.";
  return res.status(status).json({ error: { message } });
});

function logBffError(context: string, error: unknown) {
  if (env.NODE_ENV !== "development") {
    console.error(context);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(context, {
    name: error instanceof Error ? error.name : "UnknownError",
    message: message.replaceAll(env.OIDC_CLIENT_SECRET, "[redacted]"),
  });
}

export async function connectSessionStore() {
  if (!redis.isOpen) await redis.connect();
}

export async function closeSessionStore() {
  if (redis.isOpen) await redis.quit();
}
