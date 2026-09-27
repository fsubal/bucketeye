import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { buildConfig } from "./config";
import { runIndex } from "./indexer/indexer";
import { AwsS3 } from "./s3/aws";
import { createDeps } from "./deps";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".csv": "text/csv",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "seed":
      return seed(rest[0] ?? "script/sample");
    case "reindex":
      return reindex();
    case "tags":
      return tags(rest[0]);
    default:
      throw new Error(`usage: bucketeye [seed <dir> | reindex | tags <key>]`);
  }
}

/** デモ用: ディレクトリの中身を S3_BUCKET/TARGET_PREFIX に投入する。同じ内容があれば触らない（PutObject し直すとタグが消えるため） */
async function seed(dir: string): Promise<void> {
  const config = buildConfig(process.env, { requireAuth: false });
  const s3 = new AwsS3(config.s3);
  try {
    await s3.client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    await s3.client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
    console.log(`created bucket ${config.s3.bucket}`);
  }
  let put = 0;
  let skipped = 0;
  for (const file of walk(dir)) {
    const key =
      config.s3.targetPrefix + relative(dir, file).split("\\").join("/");
    const body = readFileSync(file);
    const head = await s3.head(key);
    if (head && head.etag === createHash("md5").update(body).digest("hex")) {
      skipped++;
      continue;
    }
    const contentType =
      MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
    await s3.putObject(key, body, contentType);
    console.log(`put s3://${config.s3.bucket}/${key} (${contentType})`);
    put++;
  }
  console.log(`seeded ${put} objects (${skipped} unchanged, skipped)`);
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function reindex(): Promise<void> {
  const deps = createDeps(buildConfig(process.env, { requireAuth: false }));
  const r = await runIndex(deps);
  console.log(
    `objects=${r.objects} comments=${r.comments} webhooks=${r.webhooks} removed=${r.removed}`,
  );
  deps.db.close();
}

async function tags(key: string | undefined): Promise<void> {
  if (!key) throw new Error("usage: bucketeye tags <key>");
  const config = buildConfig(process.env, { requireAuth: false });
  console.log(JSON.stringify(await new AwsS3(config.s3).getTags(key), null, 2));
}
