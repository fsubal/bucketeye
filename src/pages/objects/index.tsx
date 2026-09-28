import { clsx } from "clsx";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { reindex } from "@/api/admin";
import { listObjects } from "@/api/objects";
import type { Me } from "@/api/session";
import { StatusBadge } from "@/components/StatusBadge";
import {
  breadcrumbsOf,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
  ReviewStatus,
} from "@/domains/ReviewedObject/model";
import { formatBytes } from "@/utils/format";
import { formatDateTime } from "@/utils/datetime";

/**
 * 一覧の検索パラメータ（?prefix=&status=&page=）。URL を状態の正にする。
 * 不正な値は捨てて既定値にする（手で書き換えた URL や古いブックマークでも画面が壊れないように）。
 * 既定値のパラメータはルーター側（src/router.tsx の stripSearchParams）で URL から消す
 */
export const ObjectsSearch = z.object({
  prefix: z.string().default("").catch(""),
  status: ReviewStatus.optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
export type ObjectsSearch = z.infer<typeof ObjectsSearch>;

export default function ObjectsIndex({
  me,
  search,
}: {
  me: Me;
  search: ObjectsSearch;
}) {
  const { prefix, page } = search;
  const status = search.status ?? null;

  const q = useQuery({
    queryKey: ["objects", prefix, status, page],
    queryFn: () => listObjects({ prefix, status, page }),
  });
  const reindexM = useMutation({
    mutationFn: reindex,
    onSuccess: () => setTimeout(() => void q.refetch(), 1500),
  });

  /** リンク先の検索パラメータ。prefix や status を変えたらページは 1 に戻す */
  const searchFor = (next: {
    prefix?: string;
    status?: ReviewStatus | null;
    page?: number;
  }): Partial<ObjectsSearch> => ({
    prefix: next.prefix ?? prefix,
    status: (next.status === undefined ? status : next.status) ?? undefined,
    page: next.page,
  });

  if (q.isPending)
    return <p className={clsx("text-sm", "text-gray-500")}>読み込み中…</p>;
  if (q.isError)
    return <p className={clsx("text-sm", "text-red-700")}>{q.error.message}</p>;
  const data = q.data;
  const total = Object.values(data.counts).reduce((a, b) => a + (b ?? 0), 0);
  const pages = Math.max(
    1,
    Math.ceil(data.pagination.total / data.pagination.per),
  );

  return (
    <>
      <div
        className={clsx(
          "mb-4",
          "flex",
          "flex-wrap",
          "items-center",
          "justify-between",
          "gap-2",
        )}
      >
        <nav className="text-sm">
          <Link
            to="/objects"
            search={searchFor({ prefix: "" })}
            className={clsx("text-blue-700", "hover:underline")}
          >
            /
          </Link>
          {breadcrumbsOf(prefix).map((b) => (
            <span key={b.prefix}>
              <span className={clsx("mx-1", "text-gray-400")}>/</span>
              <Link
                to="/objects"
                search={searchFor({ prefix: b.prefix })}
                className={clsx("text-blue-700", "hover:underline")}
              >
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
        <div
          className={clsx(
            "flex",
            "items-center",
            "gap-2",
            "text-xs",
            "text-gray-500",
          )}
        >
          {data.lastIndexRun && (
            <span title={data.lastIndexRun.error ?? undefined}>
              最終索引:{" "}
              {formatDateTime(
                data.lastIndexRun.finishedAt ?? data.lastIndexRun.startedAt,
              )}
              {data.lastIndexRun.error && (
                <span className={clsx("ml-1", "text-red-600")}>（失敗）</span>
              )}
            </span>
          )}
          {me.identity.role === "admin" && (
            <button
              type="button"
              onClick={() => reindexM.mutate()}
              disabled={reindexM.isPending}
              className={clsx(
                "rounded",
                "border",
                "border-gray-300",
                "bg-white",
                "px-2",
                "py-1",
                "hover:bg-gray-100",
                "disabled:opacity-50",
              )}
            >
              再索引
            </button>
          )}
        </div>
      </div>

      <div className={clsx("mb-4", "flex", "flex-wrap", "gap-2", "text-sm")}>
        <Link
          to="/objects"
          search={searchFor({ status: null })}
          className={clsx(
            "rounded",
            "px-3",
            "py-1",
            status
              ? ["border", "border-gray-300", "bg-white"]
              : ["bg-gray-800", "text-white"],
          )}
        >
          すべて {total}
        </Link>
        {REVIEW_STATUSES.map((s) => (
          <Link
            key={s}
            to="/objects"
            search={searchFor({ status: s })}
            className={clsx(
              "rounded",
              "px-3",
              "py-1",
              status === s
                ? ["bg-gray-800", "text-white"]
                : ["border", "border-gray-300", "bg-white"],
            )}
          >
            {REVIEW_STATUS_LABELS[s]} {data.counts[s] ?? 0}
          </Link>
        ))}
      </div>

      {!data.indexed && (
        <div
          className={clsx(
            "mb-4",
            "rounded",
            "border",
            "border-amber-200",
            "bg-amber-50",
            "p-4",
            "text-sm",
            "text-amber-900",
          )}
        >
          <p className="font-medium">索引がまだありません。</p>
          <p className="mt-1">
            起動時に再索引が走ります。数秒待ってから再読み込みしてください。
          </p>
        </div>
      )}

      <table
        className={clsx(
          "w-full",
          "border-collapse",
          "overflow-hidden",
          "rounded",
          "border",
          "border-gray-200",
          "bg-white",
          "text-sm",
        )}
      >
        <thead
          className={clsx(
            "bg-gray-100",
            "text-left",
            "text-xs",
            "uppercase",
            "text-gray-600",
          )}
        >
          <tr>
            <th className={clsx("px-3", "py-2")}>名前</th>
            <th className={clsx("px-3", "py-2")}>ステータス</th>
            <th className={clsx("px-3", "py-2")}>種類</th>
            <th className={clsx("px-3", "py-2", "text-right")}>サイズ</th>
            <th className={clsx("px-3", "py-2")}>更新日時</th>
          </tr>
        </thead>
        <tbody>
          {data.folders.map((f) => (
            <tr
              key={f}
              className={clsx(
                "border-t",
                "border-gray-100",
                "hover:bg-gray-50",
              )}
            >
              <td className={clsx("px-3", "py-2")} colSpan={5}>
                <Link
                  to="/objects"
                  search={searchFor({ prefix: prefix + f })}
                  className={clsx("text-blue-700", "hover:underline")}
                >
                  📁 {f}
                </Link>
              </td>
            </tr>
          ))}
          {data.objects.map((o) => (
            <tr
              key={o.key}
              className={clsx(
                "border-t",
                "border-gray-100",
                "hover:bg-gray-50",
              )}
            >
              <td className={clsx("px-3", "py-2")}>
                <Link
                  to="/objects/$"
                  params={{ _splat: o.key }}
                  className={clsx("text-blue-700", "hover:underline")}
                >
                  {status ? o.key : o.name}
                </Link>
              </td>
              <td className={clsx("px-3", "py-2")}>
                <StatusBadge status={o.status} />
              </td>
              <td className={clsx("px-3", "py-2", "text-gray-600")}>
                {o.contentType ?? "-"}
              </td>
              <td
                className={clsx("px-3", "py-2", "text-right", "text-gray-600")}
              >
                {formatBytes(o.size)}
              </td>
              <td className={clsx("px-3", "py-2", "text-gray-600")}>
                {formatDateTime(o.lastModified)}
              </td>
            </tr>
          ))}
          {data.folders.length === 0 && data.objects.length === 0 && (
            <tr>
              <td
                className={clsx("px-3", "py-6", "text-center", "text-gray-500")}
                colSpan={5}
              >
                オブジェクトがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pages > 1 && (
        <nav
          className={clsx(
            "mt-4",
            "flex",
            "items-center",
            "justify-center",
            "gap-3",
            "text-sm",
          )}
        >
          {page > 1 && (
            <Link
              to="/objects"
              search={searchFor({ page: page - 1 })}
              className={clsx("text-blue-700", "hover:underline")}
            >
              ← 前
            </Link>
          )}
          <span className="text-gray-600">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link
              to="/objects"
              search={searchFor({ page: page + 1 })}
              className={clsx("text-blue-700", "hover:underline")}
            >
              次 →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
