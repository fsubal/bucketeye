import { z } from "zod";

/**
 * RFC 9457 Problem Details。
 *
 * - 汎用のエラー（404 / 500 など）は type を "about:blank" にし、title は HTTP の標準フレーズにする（RFC 9457 §4.2.1）
 * - アプリ固有のエラーは下の PROBLEM_TYPES に登録した type URI を使う。title は種類ごとに固定で、発生ごとの説明は detail に書く（§3.1.3）
 * - type URI は docs/problems.md の見出しを指す絶対 URL。見出しは slug と同じにしておく
 */
export const PROBLEM_DOCS_URL =
  "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md";

export const PROBLEM_TYPES = {
  authenticationRequired: {
    slug: "authentication-required",
    status: 401,
    title: "Authentication required",
  },
  adminRequired: {
    slug: "admin-required",
    status: 403,
    title: "Admin privileges required",
  },
  invalidQuery: {
    slug: "invalid-query",
    status: 400,
    title: "Invalid query parameters",
  },
  validationFailed: {
    slug: "validation-failed",
    status: 422,
    title: "Request body failed validation",
  },
} as const satisfies Record<
  string,
  { slug: string; status: number; title: string }
>;

export type ProblemTypeName = keyof typeof PROBLEM_TYPES;

export function problemTypeUri(name: ProblemTypeName): string {
  return `${PROBLEM_DOCS_URL}#${PROBLEM_TYPES[name].slug}`;
}

/** type が about:blank のときの title（RFC 9110 の reason phrase） */
export const HTTP_STATUS_PHRASES: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function httpStatusPhrase(status: number): string {
  return (
    HTTP_STATUS_PHRASES[status] ??
    (status >= 500 ? "Internal Server Error" : "Bad Request")
  );
}

/**
 * validation-failed / invalid-query の拡張メンバー errors の要素（RFC 9457 §3 の例に倣う）。
 * 本文のどこかは JSON Pointer の URI フラグメント表現（"#/body"）、クエリパラメータは名前で示す
 */
export const ProblemFieldError = z.object({
  detail: z.string(),
  pointer: z.string().optional(),
  parameter: z.string().optional(),
});
export type ProblemFieldError = z.infer<typeof ProblemFieldError>;

export const Problem = z.looseObject({
  type: z.string().default("about:blank"),
  title: z.string().optional(),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** validation-failed / invalid-query */
  errors: z.array(ProblemFieldError).optional(),
  /** authentication-required: developer プロバイダのときのログイン画面 */
  loginPath: z.string().nullable().optional(),
});
export type Problem = z.infer<typeof Problem>;

export function isProblemType(
  problem: Pick<Problem, "type">,
  name: ProblemTypeName,
): boolean {
  return problem.type === problemTypeUri(name);
}

/** zod の issue の path を JSON Pointer の URI フラグメント表現にする（RFC 6901 §6） */
export function jsonPointer(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "#";
  return `#/${path.map((p) => encodeURIComponent(String(p).replace(/~/g, "~0").replace(/\//g, "~1"))).join("/")}`;
}
