import { z } from "zod";
import { Comment } from "@/domains/Annotation/model";
import {
  ObjectKind,
  ReviewedObject,
  ReviewStatus,
} from "@/domains/ReviewedObject/model";
import { encodeKey, request, requestText } from "@/utils/http";

export const IndexRun = z.object({
  id: z.number(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  objects: z.number().nullable(),
  comments: z.number().nullable(),
  webhooks: z.number().nullable(),
  removed: z.number().nullable(),
  error: z.string().nullable(),
});
export type IndexRun = z.infer<typeof IndexRun>;

export const ObjectList = z.object({
  prefix: z.string(),
  status: ReviewStatus.nullable(),
  updatedSince: z.string().nullable(),
  folders: z.array(z.string()),
  objects: z.array(ReviewedObject),
  pagination: z.object({
    page: z.number(),
    per: z.number(),
    total: z.number(),
  }),
  counts: z.partialRecord(ReviewStatus, z.number()),
  indexed: z.boolean(),
  lastIndexRun: IndexRun.nullable(),
});
export type ObjectList = z.infer<typeof ObjectList>;

export const Preview = z.object({
  kind: ObjectKind,
  downloadUrl: z.string(),
  url: z.string().optional(),
  textUrl: z.string().optional(),
});
export type Preview = z.infer<typeof Preview>;

export const ObjectDetail = z.object({
  object: ReviewedObject,
  comments: z.array(Comment),
  preview: Preview,
});
export type ObjectDetail = z.infer<typeof ObjectDetail>;

export function listObjects(params: {
  prefix?: string;
  status?: ReviewStatus | null;
  page?: number;
}): Promise<ObjectList> {
  const q = new URLSearchParams();
  if (params.prefix) q.set("prefix", params.prefix);
  if (params.status) q.set("status", params.status);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const qs = q.toString();
  return request(ObjectList, `/api/v1/objects${qs ? `?${qs}` : ""}`);
}

export function getObject(key: string): Promise<ObjectDetail> {
  return request(ObjectDetail, `/api/v1/objects/${encodeKey(key)}`);
}

export function getObjectText(
  key: string,
): Promise<{ text: string; truncated: boolean }> {
  return requestText(`/api/v1/texts/${encodeKey(key)}`);
}
