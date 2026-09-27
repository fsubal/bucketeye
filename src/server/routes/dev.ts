import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import type { DeveloperProvider } from "../auth/providers/developer";
import { HttpProblem } from "./problem";

const Input = z.object({
  email: z.email("メールアドレスの形式が不正です"),
  name: z.string().trim().max(100).optional(),
});

/** AUTH_PROVIDER=developer のときだけ生える。メールを入れるだけでその人になれる */
export function devRoutes(provider: DeveloperProvider) {
  const r = new Hono<AppEnv>();

  r.post("/session", async (c) => {
    const input = Input.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success) throw HttpProblem.validationFailed(input.error.issues);
    await provider.signIn(
      c,
      input.data.email.trim().toLowerCase(),
      input.data.name || null,
    );
    return c.json({ ok: true });
  });

  r.delete("/session", (c) => {
    provider.signOut(c);
    return c.body(null, 204);
  });

  return r;
}
