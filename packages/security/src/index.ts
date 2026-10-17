import { createSign, createVerify } from "node:crypto";

type JsonWebTokenHeader = { alg: "RS256"; typ: "JWT" };

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function signJwtRs256(payload: Record<string, unknown>, privateKey: string): string {
  const header: JsonWebTokenHeader = { alg: "RS256", typ: "JWT" };
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}

export function verifyJwtRs256(token: string, publicKey: string): Record<string, unknown> | undefined {
  if (token.length > 8_192) return undefined;
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) return undefined;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as Record<string, unknown>;
    if (header.alg !== "RS256" || header.typ !== "JWT") return undefined;

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    if (!verifier.verify(publicKey, Buffer.from(encodedSignature, "base64url"))) return undefined;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
    return payload as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
