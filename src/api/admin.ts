import { z } from "zod";
import { IndexRun } from "@/api/objects";
import { request } from "@/utils/http";

export async function reindex(): Promise<{ started: boolean }> {
  return request(
    z.object({ started: z.boolean(), running: z.boolean() }),
    "/api/v1/admin/reindex",
    { method: "POST" },
  );
}

export async function listIndexRuns(): Promise<{
  runs: IndexRun[];
  running: boolean;
}> {
  return request(
    z.object({ runs: z.array(IndexRun), running: z.boolean() }),
    "/api/v1/admin/index-runs",
  );
}
