import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Identity } from "@/domains/Identity/model";
import type { AuthProvider } from "./provider";
import { problem } from "../routes/problem";

export type AuthEnv = { Variables: { identity: Identity } };

function validToken(candidates: readonly string[], token: string): boolean {
  const t = Buffer.from(token);
  return candidates.some((c) => {
    const b = Buffer.from(c);
    return b.length === t.length && timingSafeEqual(b, t);
  });
}

/**
 * 認証ミドルウェア。順に:
 *   1. Authorization: Bearer <API_TOKENS のいずれか> → サーバ間連携用の身元
 *   2. 前段プロキシの身元（AuthProvider）
 *   3. どちらも無ければ 401（problem+json）。login_path があれば UI 側がそこへ誘導する
 */
export function authenticate(
  provider: AuthProvider,
  apiTokens: readonly string[],
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const bearer = /^Bearer (.+)$/.exec(
      c.req.header("Authorization") ?? "",
    )?.[1];
    let identity: Identity | null = null;
    if (bearer) {
      identity = validToken(apiTokens, bearer)
        ? {
            email: "api-token",
            name: "API token",
            provider: "api_token",
            role: "reviewer",
          }
        : null;
    } else {
      identity = await provider.identify(c);
    }
    if (!identity) {
      return problem(
        c,
        401,
        "unauthenticated",
        "No trusted identity was found on this request.",
        { login_path: provider.loginPath },
      );
    }
    c.set("identity", identity);
    await next();
  };
}

export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.get("identity")?.role !== "admin")
    return problem(
      c,
      403,
      "forbidden",
      "This action requires an admin (see ADMIN_EMAILS).",
    );
  await next();
};
