import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** RFC 9457 Problem Details。エラーはすべてこの形で返す */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail?: string,
  extra: Record<string, unknown> = {},
) {
  c.header("Content-Type", "application/problem+json");
  return c.body(
    JSON.stringify({ type: "about:blank", title, status, detail, ...extra }),
    status,
  );
}

export class HttpProblem extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
  }
}
