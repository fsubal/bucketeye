import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromDate } from "@/utils/datetime";
import type { Config } from "../config";
import type {
  HeadResult,
  ListedObject,
  Listing,
  ObjectStream,
  S3Port,
} from "./port";

function isNotFound(e: unknown): boolean {
  return (
    e instanceof S3ServiceException &&
    (e.name === "NoSuchKey" ||
      e.name === "NotFound" ||
      e.$metadata.httpStatusCode === 404)
  );
}

function stripQuotes(etag: string | undefined): string | null {
  return etag ? etag.replace(/"/g, "") : null;
}

export class AwsS3 implements S3Port {
  readonly bucket: string;
  readonly reviewBucket: string;
  readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly expiresIn: number;

  constructor(s3: Config["s3"]) {
    this.bucket = s3.bucket;
    this.reviewBucket = s3.reviewBucket;
    this.expiresIn = s3.presignExpiresIn;
    const base = {
      region: s3.region,
      forcePathStyle: s3.forcePathStyle,
      ...(s3.accessKeyId && s3.secretAccessKey
        ? {
            credentials: {
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
            },
          }
        : {}),
    };
    this.client = new S3Client({
      ...base,
      ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
    });
    // presigned URL はブラウザから見えるホスト（S3_PUBLIC_ENDPOINT）で署名する
    this.presignClient =
      s3.publicEndpoint === s3.endpoint
        ? this.client
        : new S3Client({
            ...base,
            ...(s3.publicEndpoint ? { endpoint: s3.publicEndpoint } : {}),
          });
  }

  async list(opts: {
    prefix: string;
    bucket?: string;
    delimiter?: string;
    token?: string | null;
    maxKeys?: number;
  }): Promise<Listing> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: opts.bucket ?? this.bucket,
        Prefix: opts.prefix,
        Delimiter: opts.delimiter,
        ContinuationToken: opts.token ?? undefined,
        MaxKeys: opts.maxKeys ?? 1000,
      }),
    );
    return {
      objects: (res.Contents ?? []).map((o) => ({
        key: o.Key!,
        etag: stripQuotes(o.ETag),
        size: o.Size ?? 0,
        lastModified: o.LastModified ? fromDate(o.LastModified) : null,
      })),
      prefixes: (res.CommonPrefixes ?? []).map((p) => p.Prefix!),
      nextToken: res.IsTruncated ? (res.NextContinuationToken ?? null) : null,
    };
  }

  async *eachObject(opts: {
    prefix: string;
    bucket?: string;
  }): AsyncIterable<ListedObject> {
    let token: string | null = null;
    do {
      const page: Listing = await this.list({ ...opts, token });
      yield* page.objects;
      token = page.nextToken;
    } while (token);
  }

  async head(key: string, bucket = this.bucket): Promise<HeadResult | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        key,
        etag: stripQuotes(res.ETag),
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? null,
        lastModified: res.LastModified ? fromDate(res.LastModified) : null,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async openStream(
    key: string,
    bucket = this.bucket,
  ): Promise<ObjectStream | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: res.ContentType ?? null,
        contentLength: res.ContentLength ?? null,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async readHead(
    key: string,
    maxBytes: number,
    bucket = this.bucket,
  ): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          Range: `bytes=0-${maxBytes - 1}`,
        }),
      );
      return res.Body
        ? await res.Body.transformToByteArray()
        : new Uint8Array();
    } catch (e) {
      if (isNotFound(e)) return null;
      if (e instanceof S3ServiceException && e.name === "InvalidRange")
        return new Uint8Array(); // 0 バイトのオブジェクト
      throw e;
    }
  }

  async getJson(
    key: string,
    bucket = this.reviewBucket,
  ): Promise<unknown | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return JSON.parse((await res.Body?.transformToString("utf-8")) ?? "null");
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async putJson(
    key: string,
    payload: unknown,
    bucket = this.reviewBucket,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json",
      }),
    );
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
    bucket = this.bucket,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string, bucket = this.reviewBucket): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  async getTags(
    key: string,
    bucket = this.bucket,
  ): Promise<Record<string, string> | null> {
    try {
      const res = await this.client.send(
        new GetObjectTaggingCommand({ Bucket: bucket, Key: key }),
      );
      return Object.fromEntries(
        (res.TagSet ?? []).map((t) => [t.Key!, t.Value ?? ""]),
      );
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async mergeTags(
    key: string,
    changes: Record<string, string | null>,
    bucket = this.bucket,
  ): Promise<Record<string, string>> {
    const current = (await this.getTags(key, bucket)) ?? {};
    const merged: Record<string, string> = { ...current };
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete merged[k];
      else merged[k] = v;
    }
    await this.client.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: {
          TagSet: Object.entries(merged).map(([Key, Value]) => ({
            Key,
            Value,
          })),
        },
      }),
    );
    return merged;
  }

  async presign(
    key: string,
    opts: { inline?: boolean; contentType?: string; bucket?: string } = {},
  ): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: opts.bucket ?? this.bucket,
      Key: key,
      ResponseContentDisposition:
        opts.inline === false ? "attachment" : "inline",
      ResponseContentType: opts.contentType,
    });
    return getSignedUrl(this.presignClient, cmd, { expiresIn: this.expiresIn });
  }
}
