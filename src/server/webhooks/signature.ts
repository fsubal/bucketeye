import { createHmac, timingSafeEqual } from "node:crypto";

/** X-Bucketeye-Signature: sha256=<HMAC-SHA256(secret, body) の hex> */
export function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verify(
  secret: string,
  body: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(sign(secret, body));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
