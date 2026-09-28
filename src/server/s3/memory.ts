import { now, type Temporal } from "@/utils/datetime";
import { createHash } from "node:crypto";
import type { HeadResult, Listing, ListedObject, S3Port } from "./port";

type Stored = {
  body: Uint8Array;
  contentType: string;
  lastModified: Temporal.Instant;
  tags: Record<string, string>;
};

/** テスト用のインメモリ S3。ページングは小さくして each の分岐も通す */
export class MemoryS3 implements S3Port {
  readonly store = new Map<string, Stored>();
  constructor(
    readonly bucket: string,
    readonly reviewBucket: string = bucket,
    private readonly pageSize = 2,
  ) {}

  private k(bucket: string, key: string) {
    return `${bucket}\u0000${key}`;
  }

  put(
    key: string,
    body: string | Uint8Array,
    opts: {
      bucket?: string;
      contentType?: string;
      lastModified?: Temporal.Instant;
    } = {},
  ): void {
    const bytes =
      typeof body === "string" ? new TextEncoder().encode(body) : body;
    this.store.set(this.k(opts.bucket ?? this.bucket, key), {
      body: bytes,
      contentType: opts.contentType ?? "application/octet-stream",
      lastModified: opts.lastModified ?? now(),
      tags: {},
    });
  }

  keysIn(bucket: string): string[] {
    return [...this.store.keys()]
      .filter((k) => k.startsWith(`${bucket}\u0000`))
      .map((k) => k.split("\u0000")[1]!);
  }

  private etag(s: Stored) {
    return createHash("md5").update(s.body).digest("hex");
  }

  async list(opts: {
    prefix: string;
    bucket?: string;
    delimiter?: string;
    token?: string | null;
    maxKeys?: number;
  }): Promise<Listing> {
    const bucket = opts.bucket ?? this.bucket;
    const all = this.keysIn(bucket)
      .filter((k) => k.startsWith(opts.prefix))
      .sort();
    const start = opts.token ? Number(opts.token) : 0;
    const max = opts.maxKeys ?? this.pageSize;
    const page = all.slice(start, start + max);
    const objects: ListedObject[] = [];
    const prefixes = new Set<string>();
    for (const key of page) {
      const rest = key.slice(opts.prefix.length);
      if (opts.delimiter && rest.includes(opts.delimiter)) {
        prefixes.add(
          opts.prefix + rest.split(opts.delimiter)[0] + opts.delimiter,
        );
      } else {
        const s = this.store.get(this.k(bucket, key))!;
        objects.push({
          key,
          etag: this.etag(s),
          size: s.body.byteLength,
          lastModified: s.lastModified,
        });
      }
    }
    return {
      objects,
      prefixes: [...prefixes],
      nextToken: start + max < all.length ? String(start + max) : null,
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
    const s = this.store.get(this.k(bucket, key));
    return s
      ? {
          key,
          etag: this.etag(s),
          size: s.body.byteLength,
          contentType: s.contentType,
          lastModified: s.lastModified,
        }
      : null;
  }

  async readHead(
    key: string,
    maxBytes: number,
    bucket = this.bucket,
  ): Promise<Uint8Array | null> {
    const s = this.store.get(this.k(bucket, key));
    return s ? s.body.slice(0, maxBytes) : null;
  }

  async getJson(
    key: string,
    bucket = this.reviewBucket,
  ): Promise<unknown | null> {
    const s = this.store.get(this.k(bucket, key));
    return s ? JSON.parse(new TextDecoder().decode(s.body)) : null;
  }

  async putJson(
    key: string,
    payload: unknown,
    bucket = this.reviewBucket,
  ): Promise<void> {
    this.put(key, JSON.stringify(payload), {
      bucket,
      contentType: "application/json",
    });
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
    bucket = this.bucket,
  ): Promise<void> {
    // PutObject はタグを持ち越さない（本物の S3 と同じ挙動）
    this.put(key, body, { bucket, contentType });
  }

  async deleteObject(key: string, bucket = this.reviewBucket): Promise<void> {
    this.store.delete(this.k(bucket, key));
  }

  async getTags(
    key: string,
    bucket = this.bucket,
  ): Promise<Record<string, string> | null> {
    const s = this.store.get(this.k(bucket, key));
    return s ? { ...s.tags } : null;
  }

  async mergeTags(
    key: string,
    changes: Record<string, string | null>,
    bucket = this.bucket,
  ): Promise<Record<string, string>> {
    const s = this.store.get(this.k(bucket, key));
    if (!s) throw new Error(`NoSuchKey: ${key}`);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete s.tags[k];
      else s.tags[k] = v;
    }
    return { ...s.tags };
  }

  async presign(
    key: string,
    opts: { inline?: boolean; contentType?: string; bucket?: string } = {},
  ): Promise<string> {
    const u = new URL(
      `https://fake.example/${opts.bucket ?? this.bucket}/${key}`,
    );
    u.searchParams.set("inline", String(opts.inline !== false));
    if (opts.contentType) u.searchParams.set("ct", opts.contentType);
    return u.toString();
  }
}
