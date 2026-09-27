import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { buildConfig } from "../config";
import { AwsS3 } from "./aws";
import { CommentStore } from "./commentStore";
import { createStatusStore } from "./statusStore";
import { identity } from "../../../test/helpers";

/**
 * 実際の S3 互換ストレージ（compose の RustFS、versitygw、MinIO、AWS など）に対する統合テスト。
 *   S3_TEST_ENDPOINT=http://localhost:9000 S3_TEST_ACCESS_KEY_ID=rustfsadmin S3_TEST_SECRET_ACCESS_KEY=rustfsadmin npm test -- src/server/s3/aws.test.ts
 */
const endpoint = process.env["S3_TEST_ENDPOINT"];

describe.skipIf(!endpoint)("AwsS3 against a real S3-compatible server", () => {
  const config = buildConfig({
    S3_BUCKET: process.env["S3_TEST_BUCKET"] ?? "bucketeye-test",
    S3_ENDPOINT: endpoint,
    S3_ACCESS_KEY_ID: process.env["S3_TEST_ACCESS_KEY_ID"],
    S3_SECRET_ACCESS_KEY: process.env["S3_TEST_SECRET_ACCESS_KEY"],
    TARGET_PREFIX: `it-${Math.random().toString(36).slice(2, 8)}/`,
    REVIEW_PREFIX: ".review-test/",
  });
  const s3 = new AwsS3(config.s3);
  const key = `${config.s3.targetPrefix}dir/photo.png`;

  beforeEach(async () => {
    try {
      await s3.client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    } catch {
      await s3.client.send(
        new CreateBucketCommand({ Bucket: config.s3.bucket }),
      );
    }
    await s3.client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: "png-bytes",
        ContentType: "image/png",
      }),
    );
  });

  afterEach(async () => {
    for (const prefix of [config.s3.targetPrefix, config.s3.reviewPrefix]) {
      for await (const o of s3.eachObject({ prefix }))
        await s3.client.send(
          new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: o.key }),
        );
    }
  });

  test("一覧・HEAD・タグ・JSON・presigned URL が動く", async () => {
    const listing = await s3.list({
      prefix: config.s3.targetPrefix,
      delimiter: "/",
    });
    expect(listing.prefixes).toEqual([`${config.s3.targetPrefix}dir/`]);
    expect(await s3.head(key)).toMatchObject({
      contentType: "image/png",
      size: 9,
    });

    const statusStore = createStatusStore("tags", s3, config.s3.reviewPrefix);
    await statusStore.write(key, "approved", "alice@example.com");
    expect((await s3.getTags(key))?.["review-status"]).toBe("approved");
    expect((await statusStore.read(key))?.status).toBe("approved");

    const comments = new CommentStore(s3, config.s3.reviewPrefix);
    await comments.append(key, { body: "looks good", creator: identity() });
    expect((await comments.list(key)).map((a) => a.body.value)).toEqual([
      "looks good",
    ]);

    const url = await s3.presign(key);
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain("response-content-disposition=inline");
    expect(new TextDecoder().decode((await s3.readHead(key, 3))!)).toBe("png");
    expect(await s3.head(`${config.s3.targetPrefix}missing`)).toBeNull();
  });
});
