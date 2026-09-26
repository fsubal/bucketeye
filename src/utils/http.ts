import type { z } from "zod";

/** RFC 9457 Problem Details をそのまま持つエラー。/api 以下の関数はこれを投げる */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string | undefined,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
  }
  get loginPath(): string | null {
    return typeof this.extra["login_path"] === "string"
      ? (this.extra["login_path"] as string)
      : null;
  }
}

async function throwProblem(res: Response): Promise<never> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  const { title, detail, status: _s, type: _t, ...extra } = body;
  throw new HttpError(
    res.status,
    typeof title === "string" ? title : res.statusText,
    typeof detail === "string" ? detail : undefined,
    extra,
  );
}

/** JSON API を叩き、zod でパースした値を返す。Response は露出させない */
export async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) await throwProblem(res);
  if (res.status === 204) return schema.parse(undefined);
  return schema.parse(await res.json());
}

export async function requestText(
  path: string,
): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) await throwProblem(res);
  return {
    text: await res.text(),
    truncated: res.headers.get("X-Truncated") === "true",
  };
}

/** キーをパスに埋める（スラッシュは残し、それ以外をエンコード） */
export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
