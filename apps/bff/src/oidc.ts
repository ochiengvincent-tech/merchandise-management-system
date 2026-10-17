import * as oidc from "openid-client";
import { env } from "./config.js";

let discovery: Promise<oidc.Configuration> | undefined;

export function getOidcConfiguration(): Promise<oidc.Configuration> {
  if (!discovery) {
    discovery = oidc.discovery(
      new URL(env.OIDC_ISSUER),
      env.OIDC_CLIENT_ID,
      env.OIDC_CLIENT_SECRET,
      undefined,
      env.NODE_ENV === "development"
        ? { execute: [oidc.allowInsecureRequests] }
        : undefined,
    ).catch((error: unknown) => {
      discovery = undefined;
      throw error;
    });
  }
  return discovery;
}

export { oidc };
