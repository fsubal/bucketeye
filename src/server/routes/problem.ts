import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  httpStatusPhrase,
  jsonPointer,
  PROBLEM_TYPES,
  problemTypeUri,
  type Problem,
  type ProblemTypeName,
} from "@/domains/Problem/model";

type Issue = { path: ReadonlyArray<PropertyKey>; message: string };

/**
 * RFC 9457 Problem Details を投げるための例外。app.ts の onError がレスポンスにする。
 * title は呼び出し側が決められない（about:blank なら HTTP の標準フレーズ、固有の type なら種類ごとの固定文言）
 */
export class HttpProblem extends Error {
  readonly body: Problem;

  private constructor(
    readonly status: ContentfulStatusCode,
    body: Problem,
  ) {
    super(body.detail ?? body.title);
    this.body = body;
  }

  /** 汎用のエラー（type は about:blank） */
  static status(status: ContentfulStatusCode, detail?: string): HttpProblem {
    return new HttpProblem(status, {
      type: "about:blank",
      title: httpStatusPhrase(status),
      status,
      ...(detail ? { detail } : {}),
    });
  }

  static notFound(detail?: string): HttpProblem {
    return HttpProblem.status(404, detail);
  }

  /** アプリ固有のエラー。status と title は PROBLEM_TYPES から決まる */
  static of(
    name: ProblemTypeName,
    init: { detail?: string; extensions?: Partial<Problem> } = {},
  ): HttpProblem {
    const t = PROBLEM_TYPES[name];
    return new HttpProblem(t.status, {
      type: problemTypeUri(name),
      title: t.title,
      status: t.status,
      ...(init.detail ? { detail: init.detail } : {}),
      ...init.extensions,
    });
  }

  /** リクエスト本文の検証エラー。どこが悪いかは errors[].pointer（JSON Pointer）で示す */
  static validationFailed(issues: ReadonlyArray<Issue>): HttpProblem {
    return HttpProblem.of("validationFailed", {
      detail: issues.map((i) => i.message).join(" / "),
      extensions: {
        errors: issues.map((i) => ({
          detail: i.message,
          pointer: jsonPointer(i.path),
        })),
      },
    });
  }

  /** クエリパラメータの検証エラー。どこが悪いかは errors[].parameter で示す */
  static invalidQuery(issues: ReadonlyArray<Issue>): HttpProblem {
    return HttpProblem.of("invalidQuery", {
      detail: issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "),
      extensions: {
        errors: issues.map((i) => ({
          detail: i.message,
          parameter: i.path.join("."),
        })),
      },
    });
  }
}

export function problemResponse(c: Context, p: HttpProblem) {
  c.header("Content-Type", "application/problem+json");
  return c.body(JSON.stringify(p.body), p.status);
}
