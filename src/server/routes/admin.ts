import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireAdmin } from "../auth/middleware";
import { listIndexRuns } from "../db/indexRuns";

export function adminRoutes() {
  const r = new Hono<AppEnv>();
  r.use("*", requireAdmin);

  /** 再索引を今すぐ走らせる（待たずに 202 を返す） */
  r.post("/reindex", (c) => {
    const { poller } = c.get("deps");
    const alreadyRunning = poller.isRunning;
    void poller.runNow();
    return c.json({ started: !alreadyRunning, running: true }, 202);
  });

  r.get("/index-runs", (c) =>
    c.json({
      runs: listIndexRuns(c.get("deps").db),
      running: c.get("deps").poller.isRunning,
    }),
  );

  return r;
}
