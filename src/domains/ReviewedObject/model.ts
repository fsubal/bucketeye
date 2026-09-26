import { z } from "zod";

/** 承認ステータス。S3 のオブジェクトタグ `review-status` に書かれる値そのもの */
export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "changes_requested",
  "rejected",
] as const;
export const ReviewStatus = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export const DEFAULT_STATUS: ReviewStatus = "pending";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "未レビュー",
  approved: "承認",
  changes_requested: "修正依頼",
  rejected: "却下",
};

/** S3 タグのキー（Rails 版 s3review と互換） */
export const STATUS_TAGS = {
  status: "review-status",
  updatedAt: "review-updated-at",
  reviewer: "review-reviewer",
} as const;

export const OBJECT_KINDS = [
  "image",
  "video",
  "audio",
  "pdf",
  "text",
  "other",
] as const;
export const ObjectKind = z.enum(OBJECT_KINDS);
export type ObjectKind = z.infer<typeof ObjectKind>;

/** プレビューの出し分けに使う大分類 */
export function kindOf(contentType: string | null | undefined): ObjectKind {
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (
    type.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript"].includes(
      type,
    )
  )
    return "text";
  return "other";
}

/** SQLite の索引行 = API が返すオブジェクト */
export const ReviewedObject = z.object({
  bucket: z.string(),
  key: z.string(),
  name: z.string(),
  etag: z.string().nullable(),
  size: z.number().int().nullable(),
  content_type: z.string().nullable(),
  kind: ObjectKind,
  last_modified: z.string().nullable(),
  status: ReviewStatus,
  status_updated_at: z.string().nullable(),
  reviewer: z.string().nullable(),
  indexed_at: z.string().nullable(),
});
export type ReviewedObject = z.infer<typeof ReviewedObject>;

export function nameOf(key: string): string {
  return key.split("/").pop() ?? key;
}

export function parentPrefixOf(key: string): string {
  const i = key.lastIndexOf("/");
  return i === -1 ? "" : key.slice(0, i + 1);
}

/** "a/b/c/" → [{label:"a", prefix:"a/"}, {label:"b", prefix:"a/b/"}, ...]（パンくず用） */
export function breadcrumbsOf(
  prefix: string,
): Array<{ label: string; prefix: string }> {
  const parts = prefix.split("/").filter(Boolean);
  return parts.map((label, i) => ({
    label,
    prefix: parts.slice(0, i + 1).join("/") + "/",
  }));
}

/** 末尾に "/" を付け、先頭の "/" を落とす。"" はそのまま */
export function normalizePrefix(prefix: string): string {
  const p = prefix.replace(/^\/+/, "");
  return p === "" || p.endsWith("/") ? p : `${p}/`;
}
