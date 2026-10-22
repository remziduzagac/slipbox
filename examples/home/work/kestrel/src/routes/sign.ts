import { createHmac } from "node:crypto";

const SECRET = process.env.KESTREL_SIGNING_KEY ?? "dev-only";

/** HMAC-signs a share token so the server can verify it without a lookup. */
export function sign(token: string, expires: number): string {
  return createHmac("sha256", SECRET).update(`${token}.${expires}`).digest("hex").slice(0, 32);
}

export function verify(token: string, expires: number, sig: string): boolean {
  return sign(token, expires) === sig && expires > Date.now() / 1000;
}
