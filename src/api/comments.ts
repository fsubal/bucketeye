import { z } from "zod";
import { Comment, type Selector } from "@/domains/Annotation/model";
import { encodeKey, request } from "@/utils/http";

export async function createComment(
  key: string,
  input: { body: string; selector?: Selector },
): Promise<Comment> {
  const res = await request(
    z.object({ comment: Comment }),
    `/api/v1/comments/${encodeKey(key)}`,
    { method: "POST", json: input },
  );
  return res.comment;
}
