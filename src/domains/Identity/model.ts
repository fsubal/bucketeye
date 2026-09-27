import { z } from "zod";

/**
 * 認証済みの人。前段プロキシ（IAP / ALB / Cloudflare Access / oauth2-proxy）が付けた身元から作る。
 * ユーザーテーブルは持たず、コメントの creator にはこの email / name がそのまま載る
 */
export const Identity = z.object({
  email: z.string().min(1),
  name: z.string().min(1),
  provider: z.string(),
  role: z.enum(["admin", "reviewer"]),
});
export type Identity = z.infer<typeof Identity>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdmin(
  email: string,
  adminEmails: readonly string[],
): boolean {
  const e = normalizeEmail(email);
  return adminEmails.some((a) => normalizeEmail(a) === e);
}
