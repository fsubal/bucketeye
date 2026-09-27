import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/**
 * 本番では Hono が dist/web（Vite のビルド結果）を配信する。/api と /up 以外は index.html に落として SPA のルーターに任せる。
 * 開発中は Vite の dev server が UI を出すのでここは使われない
 */
export function mountStatic(
  app: Hono<any>,
  root = process.env["WEB_DIST"] ?? resolve(process.cwd(), "dist/web"),
): boolean {
  if (!existsSync(resolve(root, "index.html"))) return false;
  const relRoot = relativeRoot(root);
  app.use(
    "/assets/*",
    serveStatic({
      root: relRoot,
      onFound: (_path, c) =>
        c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use("*", serveStatic({ root: relRoot }));
  app.get(
    "*",
    serveStatic({
      root: relRoot,
      rewriteRequestPath: () => "/index.html",
      onFound: (_p, c) => c.header("Cache-Control", "no-cache"),
    }),
  );
  return true;
}

// @hono/node-server の serveStatic は cwd 相対の root を期待する
function relativeRoot(root: string): string {
  const rel = resolve(root)
    .replace(resolve(process.cwd()), "")
    .replace(/^\//, "");
  return rel === "" ? "./" : `./${rel}`;
}
