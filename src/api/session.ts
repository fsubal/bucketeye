import { z } from "zod";
import { Identity } from "@/domains/Identity/model";
import { request } from "@/utils/http";

export const Me = z.object({
  identity: Identity,
  provider: z.record(z.string(), z.unknown()),
  loginPath: z.string().nullable(),
  adminEmailsConfigured: z.boolean(),
  headersPresent: z.array(z.string()),
});
export type Me = z.infer<typeof Me>;

export const AppConfig = z.object({
  bucket: z.string(),
  targetPrefix: z.string(),
  statusStrategy: z.enum(["tags", "sidecar"]),
});
export type AppConfig = z.infer<typeof AppConfig>;

export function getMe(): Promise<Me> {
  return request(Me, "/api/v1/me");
}

export function getConfig(): Promise<AppConfig> {
  return request(AppConfig, "/api/v1/config");
}

export async function devLogin(email: string, name: string): Promise<void> {
  await request(z.object({ ok: z.literal(true) }), "/api/v1/dev/session", {
    method: "POST",
    json: { email, name: name || undefined },
  });
}

export async function devLogout(): Promise<void> {
  await request(z.undefined(), "/api/v1/dev/session", { method: "DELETE" });
}
