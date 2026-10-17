import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  PUBLIC_ORIGIN: z.url(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SESSION_SECRET: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  REDIS_URL: z.url(),
  OIDC_ISSUER: z.url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.url(),
  OIDC_EMPLOYEE_ID_CLAIM: z.string().min(1).default("employee_id"),
  BFF_ASSERTION_PRIVATE_KEY_PATH: z.string().min(1),
  VENDOR_API_URL: z.url().default("http://localhost:3001"),
  INVENTORY_API_URL: z.url().default("http://localhost:3002"),
  PROCUREMENT_API_URL: z.url().default("http://localhost:3003"),
  RECEIVING_API_URL: z.url().default("http://localhost:3004"),
  WAREHOUSE_API_URL: z.url().default("http://localhost:3005"),
  RETAIL_SALES_API_URL: z.url().default("http://localhost:3006"),
  SALES_AUDIT_API_URL: z.url().default("http://localhost:3007"),
  FINANCIALS_API_URL: z.url().default("http://localhost:3008"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid BFF configuration: ${z.prettifyError(parsed.error)}`);
}

const { PUBLIC_ORIGIN, OIDC_ISSUER, OIDC_REDIRECT_URI, NODE_ENV } = parsed.data;
if (new URL(PUBLIC_ORIGIN).protocol !== "https:" && NODE_ENV === "production") {
  throw new Error("PUBLIC_ORIGIN must use HTTPS in production");
}
if (new URL(OIDC_ISSUER).protocol !== "https:" && NODE_ENV === "production") {
  throw new Error("OIDC_ISSUER must use HTTPS in production");
}
if (new URL(OIDC_REDIRECT_URI).origin !== PUBLIC_ORIGIN) {
  throw new Error("OIDC_REDIRECT_URI must use the same origin as PUBLIC_ORIGIN");
}

export const env = {
  ...parsed.data,
  PUBLIC_ORIGIN: new URL(PUBLIC_ORIGIN).origin,
  SESSION_COOKIE_NAME: NODE_ENV === "production" ? "__Host-mms.sid" : "mms.sid",
  SESSION_COOKIE_SECURE: NODE_ENV === "production",
  SESSION_MAX_AGE_MS: parsed.data.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
  SESSION_IDLE_MS: parsed.data.SESSION_IDLE_MINUTES * 60 * 1000,
};
