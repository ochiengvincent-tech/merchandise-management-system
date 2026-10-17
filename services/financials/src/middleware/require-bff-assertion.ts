import { readFileSync } from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { verifyJwtRs256 } from "@mms/security";
import { env } from "../config/env.js";

const publicKey = readFileSync(env.BFF_ASSERTION_PUBLIC_KEY_PATH, "utf8");
const assertionClaims = z.object({
  iss: z.literal("mms-bff"),
  aud: z.literal("financials"),
  sub: z.uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.uuid(),
  htm: z.string().min(1).max(10),
  htu: z.string().startsWith("/api/v1/").max(2048),
});

export function requireBffAssertion(req: Request, res: Response, next: NextFunction) {
  const assertion = req.get("x-mms-bff-assertion");
  if (!assertion) return reject(res);

  const parsed = assertionClaims.safeParse(verifyJwtRs256(assertion, publicKey));
  if (!parsed.success) return reject(res);

  const claims = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iat > now + 5 || claims.exp <= now || claims.exp - claims.iat > 30) return reject(res);
  if (claims.htm !== req.method || claims.htu !== req.originalUrl) return reject(res);
  if (req.get("x-actor-id") !== claims.sub) return reject(res);

  res.locals.authenticatedPrincipal = { employeeId: claims.sub, issuer: claims.iss };
  return next();
}

function reject(res: Response) {
  return res.status(401).json({ error: { message: "A trusted service identity is required." } });
}
