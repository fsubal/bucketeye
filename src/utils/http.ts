import type { z } from "zod";
import {
  Problem,
  type ProblemTypeName,
  isProblemType,
} from "@/domains/Problem/model";

/** RFC 9457 Problem Details をそのまま持つエラー。/api 以下の関数はこれを投げる */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
  }

  get loginPath(): string | null {
    return this.problem.loginPath ?? null;
  }

  /** validation-failed / invalid-query のときのフィールドごとのエラー */
  get errors(): NonNullable<Problem["errors"]> {
    return this.problem.errors ?? [];
  }

  is(name: ProblemTypeName): boolean {
    return isProblemType(this.problem, name);
  }
}

async function throwProblem(res: Response): Promise<never> {
  const problem: Problem = await res
    .json()
    .then(Problem.parse)
    // parseできなかったケース、そもそもjsonじゃなかったケースはどちらも同じ内容を返す
    .catch(() => ({
      type: "about:blank",
      title: res.statusText,
      status: res.status,
    }));

  throw new HttpError(res.status, problem);
}

/** JSON API を叩き、zod でパースした値を返す。Response は露出させない */
export async function request<T>(
  schema: z.ZodType<T>,
  path: string | URL,
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
  path: string | URL,
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
