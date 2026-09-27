import { createRemoteJWKSet, importSPKI, type CryptoKey } from "jose";
import type { KeyResolver } from "./provider";

/** JWKS（IAP / Cloudflare Access）。jose がキャッシュとローテーション時の再取得を面倒見る */
export function jwksResolver(url: string): KeyResolver {
  return createRemoteJWKSet(new URL(url), { cacheMaxAge: 60 * 60 * 1000 });
}

/**
 * ALB は kid ごとに PEM 形式の公開鍵を配る（https://public-keys.auth.elb.<region>.amazonaws.com/<kid>）。
 * 任意で ALB_ARN と JWT ヘッダの signer を照合する
 */
export function albKeyResolver(
  region: string,
  expectedSigner?: string,
  fetchImpl: typeof fetch = fetch,
): KeyResolver {
  const cache = new Map<string, { key: CryptoKey; expires: number }>();
  return async (header) => {
    const kid = String(header.kid ?? "");
    if (!/^[0-9a-f-]{20,64}$/.test(kid))
      throw new Error("kid is missing or malformed");
    const signer = (header as Record<string, unknown>)["signer"];
    if (expectedSigner && signer !== expectedSigner)
      throw new Error(`unexpected signer: ${String(signer)}`);
    const hit = cache.get(kid);
    if (hit && hit.expires > Date.now()) return hit.key;
    const res = await fetchImpl(
      `https://public-keys.auth.elb.${region}.amazonaws.com/${kid}`,
    );
    if (!res.ok)
      throw new Error(`failed to fetch ALB public key: HTTP ${res.status}`);
    const key = await importSPKI(await res.text(), "ES256");
    cache.set(kid, { key, expires: Date.now() + 60 * 60 * 1000 });
    return key;
  };
}
