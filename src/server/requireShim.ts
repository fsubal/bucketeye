import { createRequire } from "node:module";

/**
 * hono request（Hono CLI）は app を ESM に束ねて data: URL から import する。その中では require が未定義なので、
 * 束ねた CommonJS の依存（AWS SDK の一部）が require("node:https") を呼ぶと
 * `Dynamic require of "node:https" is not supported` で落ちる。
 * esbuild の __require ヘルパーは呼ばれた時点でグローバルの require を探すので、先に用意しておく。
 * （本番ビルドは esbuild の banner で同じことをしている。package.json の build:server を参照）
 */
const g = globalThis as { require?: NodeJS.Require };
g.require ??= createRequire(`${process.cwd()}/`);
