import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
loadEnv({ path: new URL(".env", import.meta.url).pathname });
export default defineConfig({ schema: "./src/db/schema/index.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } });
