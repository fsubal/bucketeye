import { z } from "zod";
import {
  ReviewedObject,
  type ReviewStatus,
} from "@/domains/ReviewedObject/model";
import { encodeKey, request } from "@/utils/http";

export async function updateStatus(
  key: string,
  status: ReviewStatus,
): Promise<ReviewedObject> {
  const res = await request(
    z.object({ object: ReviewedObject }),
    `/api/v1/statuses/${encodeKey(key)}`,
    { method: "PUT", json: { status } },
  );
  return res.object;
}
