import { Hono, type Context } from "hono";
import { z } from "zod";
import { Selector } from "@/domains/Annotation/model";
import {
  fromSelector,
  isPositionAllowed,
  positionKindFor,
  toSelector,
} from "@/domains/Annotation/position";
import {
  normalizePrefix,
  type ObjectKind,
  ReviewStatus,
} from "@/domains/ReviewedObject/model";
import { Instant, toIsoSeconds } from "@/utils/datetime";
import type { AppEnv } from "../app";
import {
  countByStatus,
  countObjects,
  findObject,
  listChildPrefixes,
  listObjects,
  toReviewedObject,
  updateObjectStatus,
} from "../db/objects";
import { upsertComment } from "../db/comments";
import { lastIndexRun } from "../db/indexRuns";
import { hasAnyObject } from "../db/objects";
import { isTargetKey } from "../indexer/indexer";
import { findOrSyncObject, syncComments, syncObject } from "../indexer/sync";
import { HttpProblem } from "./problem";

const TEXT_PREVIEW_BYTES = 256 * 1024;
const DEFAULT_PER = 100;
const MAX_PER = 500;

const ListQuery = z.object({
  prefix: z.string().default(""),
  status: ReviewStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().min(1).max(MAX_PER).default(DEFAULT_PER),
  // ISO 8601（タイムゾーン必須）を Temporal.Instant に
  updatedSince: Instant.optional(),
});

const CommentInput = z.object({
  body: z.string().trim().min(1, "コメントを入力してください").max(10_000),
  selector: Selector.optional(),
});
const StatusInput = z.object({ status: ReviewStatus });

export function objectsRoutes() {
  const r = new Hono<AppEnv>();

  // GET /objects?prefix=&status=&page=&per=
  r.get("/", (c) => {
    const { config, db, s3 } = c.get("deps");
    const q = ListQuery.safeParse(c.req.query());
    if (!q.success) throw HttpProblem.invalidQuery(q.error.issues);
    const relativePrefix = normalizePrefix(q.data.prefix);
    const fullPrefix = config.s3.targetPrefix + relativePrefix;
    const status = q.data.status ?? null;
    const updatedSince = q.data.updatedSince ?? null;
    // 条件で絞るときはフォルダを無視して prefix 以下を平らに並べる（「承認済み一覧」「この時刻以降の変更」の意味）
    const flat = status !== null || updatedSince !== null;
    const opts = {
      bucket: s3.bucket,
      prefix: fullPrefix,
      status,
      updatedSince,
      limit: q.data.per,
      offset: (q.data.page - 1) * q.data.per,
    };
    const total = countObjects(db, opts);
    const objects = listObjects(db, opts).map(toReviewedObject);
    return c.json({
      prefix: relativePrefix,
      status,
      updatedSince,
      folders: flat ? [] : listChildPrefixes(db, s3.bucket, fullPrefix),
      objects,
      pagination: { page: q.data.page, per: q.data.per, total },
      counts: countByStatus(db, s3.bucket, fullPrefix),
      indexed: hasAnyObject(db, s3.bucket),
      lastIndexRun: lastIndexRun(db),
    });
  });

  // GET /objects/*  — S3 から読み直して返す（索引が古くても詳細は最新）
  r.get("/*", async (c) => {
    const deps = c.get("deps");
    const key = targetKey(c, "/api/v1/objects/");
    const object = await syncObject(deps, key);
    if (!object) throw HttpProblem.notFound();
    const comments = await syncComments(deps, key);
    const preview: Record<string, unknown> = {
      kind: object.kind,
      downloadUrl: await deps.s3.presign(key, { inline: false }),
    };
    if (
      object.kind === "image" ||
      object.kind === "video" ||
      object.kind === "audio"
    )
      preview["url"] = await deps.s3.presign(key);
    if (object.kind === "pdf")
      preview["url"] = await deps.s3.presign(key, {
        contentType: "application/pdf",
      });
    if (object.kind === "text")
      preview["textUrl"] = `/api/v1/texts/${encodeURI(key)}`;
    return c.json({ object, comments, preview });
  });

  return r;
}

/**
 * キーはスラッシュを含むので、動詞つきの操作は /objects/*key/comments のような形にせず別の名前空間に置く
 * （Hono の RegExpRouter は /:key{.+} を貪欲に先に当てるため、後置きのサブパスは曖昧になる）
 */
export function textsRoutes() {
  const r = new Hono<AppEnv>();
  // GET /texts/*  — テキストプレビュー（先頭 256KB）
  r.get("/*", async (c) => {
    const { s3, db } = c.get("deps");
    const key = targetKey(c, "/api/v1/texts/");
    const bytes = await s3.readHead(key, TEXT_PREVIEW_BYTES);
    if (bytes === null) throw HttpProblem.notFound();
    const object = findObject(db, s3.bucket, key);
    c.header(
      "X-Truncated",
      object && (object.size ?? 0) > TEXT_PREVIEW_BYTES ? "true" : "false",
    );
    return c.text(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  });
  return r;
}

export function commentsRoutes() {
  const r = new Hono<AppEnv>();

  // GET /comments/*  — W3C Annotation の平たい形で返す
  r.get("/*", async (c) => {
    const deps = c.get("deps");
    const key = targetKey(c, "/api/v1/comments/");
    if (!(await findOrSyncObject(deps, key))) throw HttpProblem.notFound();
    return c.json({ comments: await syncComments(deps, key) });
  });

  // POST /comments/*  {body, selector?}
  r.post("/*", async (c) => {
    const deps = c.get("deps");
    const key = targetKey(c, "/api/v1/comments/");
    const input = CommentInput.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success) throw HttpProblem.validationFailed(input.error.issues);
    const object = await findOrSyncObject(deps, key);
    if (!object) throw HttpProblem.notFound();
    const selector = normalizeSelector(object.kind, input.data.selector);

    // S3 に書いてから SQLite に写す（S3 が真実）
    const annotation = await deps.commentStore.append(key, {
      body: input.data.body,
      creator: c.get("identity"),
      selector,
    });
    const comment = upsertComment(deps.db, deps.s3.bucket, key, annotation);
    deps.dispatcher.emit({
      type: "comment.created",
      key,
      data: { bucket: deps.s3.bucket, key, comment: annotation, object },
    });
    return c.json({ comment }, 201);
  });

  return r;
}

export function statusesRoutes() {
  const r = new Hono<AppEnv>();

  // PUT /statuses/*  {status}
  r.put("/*", async (c) => {
    const deps = c.get("deps");
    const key = targetKey(c, "/api/v1/statuses/");
    const input = StatusInput.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success) throw HttpProblem.validationFailed(input.error.issues);
    const before = await findOrSyncObject(deps, key);
    if (!before) throw HttpProblem.notFound();

    const identity = c.get("identity");
    const written = await deps.statusStore.write(
      key,
      input.data.status,
      identity.email,
    );
    updateObjectStatus(deps.db, deps.s3.bucket, key, {
      status: written.status,
      updatedAt: written.updatedAt ? toIsoSeconds(written.updatedAt) : null,
      reviewer: written.reviewer,
    });
    const object = {
      ...before,
      status: written.status,
      statusUpdatedAt: written.updatedAt,
      reviewer: written.reviewer,
    };
    if (before.status !== written.status) {
      deps.dispatcher.emit({
        type: "object.status_changed",
        key,
        data: {
          bucket: deps.s3.bucket,
          key,
          status: written.status,
          previousStatus: before.status,
          reviewer: identity.email,
          object,
        },
      });
    }
    return c.json({ object });
  });

  return r;
}

/**
 * コメントの位置（selector）を検証して正規化する。
 * 読めない値や、ファイルの種類に合わない位置（画像に行番号など）は 422。受け付けた値は書式を揃えて保存する
 */
function normalizeSelector(
  kind: ObjectKind,
  selector: Selector | undefined,
): Selector | undefined {
  if (!selector) return undefined;
  const position = fromSelector(selector);
  const expected = positionKindFor(kind);
  if (!position || !isPositionAllowed(kind, position)) {
    throw HttpProblem.validationFailed([
      {
        path: ["selector"],
        message: expected
          ? `this ${kind} accepts only a ${expected} position (see src/domains/Annotation/position.ts)`
          : `positions are not supported for ${kind} files; omit selector to comment on the whole file`,
      },
    ]);
  }
  return toSelector(position);
}

/** パスからキーを取り出し、対象範囲（TARGET_PREFIX 以下、サイドカー以外）か確かめる */
export function targetKey(c: Context<AppEnv>, base: string): string {
  const path = c.req.path;
  const key = path.startsWith(base)
    ? decodeURIComponent(path.slice(base.length))
    : "";
  if (!isTargetKey(c.get("deps").config, key))
    throw HttpProblem.notFound("key is outside TARGET_PREFIX");
  return key;
}
