import { z } from "zod";
import { sourceFor } from "@/domains/Annotation/model";
import {
  Instant,
  now,
  type Temporal,
  toIsoSeconds,
  tryParseInstant,
} from "@/utils/datetime";
import {
  DEFAULT_STATUS,
  REVIEW_STATUSES,
  ReviewStatus,
  STATUS_TAGS,
} from "@/domains/ReviewedObject/model";
import type { S3Port } from "./port";
import { statusSidecarKey } from "./keys";

export type StatusRecord = {
  status: ReviewStatus;
  updatedAt: Temporal.Instant | null;
  reviewer: string | null;
};

export const PENDING: StatusRecord = {
  status: DEFAULT_STATUS,
  updatedAt: null,
  reviewer: null,
};

export interface StatusStore {
  /** オブジェクトが無ければ null */
  read(key: string): Promise<StatusRecord | null>;
  write(
    key: string,
    status: ReviewStatus,
    reviewer: string,
    at?: Temporal.Instant,
  ): Promise<StatusRecord>;
}

function coerceStatus(v: unknown): ReviewStatus {
  return REVIEW_STATUSES.find((status) => status === v) ?? DEFAULT_STATUS;
}

/** オブジェクトタグ（AWS S3 / MinIO / Ceph RGW / RustFS）。コピー不要で更新でき、ライフサイクルやポリシーの条件にも使える */
export class TagStatusStore implements StatusStore {
  constructor(private readonly s3: S3Port) {}

  async read(key: string): Promise<StatusRecord | null> {
    const tags = await this.s3.getTags(key);
    if (tags === null) return null;
    if (!(STATUS_TAGS.status in tags)) return PENDING;
    return {
      status: coerceStatus(tags[STATUS_TAGS.status]),
      updatedAt: tryParseInstant(tags[STATUS_TAGS.updatedAt]),
      reviewer: tags[STATUS_TAGS.reviewer] || null,
    };
  }

  async write(
    key: string,
    status: ReviewStatus,
    reviewer: string,
    at = now(),
  ): Promise<StatusRecord> {
    const updatedAt = at;
    await this.s3.mergeTags(key, {
      [STATUS_TAGS.status]: status,
      [STATUS_TAGS.updatedAt]: toIsoSeconds(updatedAt),
      // タグ値に使える文字は英数字と空白 + - = . _ : / @ のみ（S3 の制約）
      [STATUS_TAGS.reviewer]: reviewer
        .replace(/[^A-Za-z0-9 +\-=._:/@]/g, "_")
        .slice(0, 256),
    });
    return { status, updatedAt, reviewer };
  }
}

/**
 * status.json の中身。読み込みは寛容にしておく（不正な値や欠けたキーは pending / null として扱い、索引を止めない）
 */
export const StatusSidecar = z.object({
  source: z.string().optional(),
  status: ReviewStatus.catch(DEFAULT_STATUS),
  updatedAt: Instant.nullable().catch(null),
  reviewer: z.string().nullable().catch(null),
});
export type StatusSidecar = z.infer<typeof StatusSidecar>;

/** タグのない GCS などの逃げ道: <REVIEW_PREFIX>objects/<sha256(key)>/status.json */
export class SidecarStatusStore implements StatusStore {
  constructor(
    private readonly s3: S3Port,
    private readonly reviewPrefix: string,
  ) {}

  async read(key: string): Promise<StatusRecord | null> {
    const json = await this.s3.getJson(
      statusSidecarKey(this.reviewPrefix, key),
    );
    if (json === null) return PENDING;
    const parsed = StatusSidecar.safeParse(json);
    if (!parsed.success) return PENDING;
    const { status, updatedAt, reviewer } = parsed.data;
    return { status, updatedAt, reviewer };
  }

  async write(
    key: string,
    status: ReviewStatus,
    reviewer: string,
    at = now(),
  ): Promise<StatusRecord> {
    const updatedAt = at;
    const sidecar: StatusSidecar = {
      source: sourceFor(this.s3.bucket, key),
      status,
      updatedAt,
      reviewer,
    };
    await this.s3.putJson(statusSidecarKey(this.reviewPrefix, key), sidecar);
    return { status, updatedAt, reviewer };
  }
}

export function createStatusStore(
  strategy: "tags" | "sidecar",
  s3: S3Port,
  reviewPrefix: string,
): StatusStore {
  return strategy === "tags"
    ? new TagStatusStore(s3)
    : new SidecarStatusStore(s3, reviewPrefix);
}
