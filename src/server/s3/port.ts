import type { Temporal } from "@/utils/datetime";

/**
 * S3 互換ストレージへの操作を抽象化した口。実装は aws.ts（@aws-sdk/client-s3）と memory.ts（テスト用）。
 * ルートやストアはこの interface だけに依存する
 */
export type ListedObject = {
  key: string;
  etag: string | null;
  size: number;
  lastModified: Temporal.Instant | null;
};
export type Listing = {
  objects: ListedObject[];
  prefixes: string[];
  nextToken: string | null;
};
export type HeadResult = {
  key: string;
  etag: string | null;
  size: number;
  contentType: string | null;
  lastModified: Temporal.Instant | null;
};

export interface S3Port {
  readonly bucket: string;
  readonly reviewBucket: string;

  list(opts: {
    prefix: string;
    bucket?: string;
    delimiter?: string;
    token?: string | null;
    maxKeys?: number;
  }): Promise<Listing>;
  /** prefix 以下の全オブジェクト（ページングを隠す） */
  eachObject(opts: {
    prefix: string;
    bucket?: string;
  }): AsyncIterable<ListedObject>;
  head(key: string, bucket?: string): Promise<HeadResult | null>;
  /** テキストプレビュー用。先頭 maxBytes だけ読む。無ければ null */
  readHead(
    key: string,
    maxBytes: number,
    bucket?: string,
  ): Promise<Uint8Array | null>;
  getJson(key: string, bucket?: string): Promise<unknown | null>;
  putJson(key: string, payload: unknown, bucket?: string): Promise<void>;
  putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
    bucket?: string,
  ): Promise<void>;
  deleteObject(key: string, bucket?: string): Promise<void>;
  /** タグ。オブジェクトが無ければ null */
  getTags(key: string, bucket?: string): Promise<Record<string, string> | null>;
  /** PutObjectTagging は全置換なので、読んでからマージして書く。null の値は削除 */
  mergeTags(
    key: string,
    changes: Record<string, string | null>,
    bucket?: string,
  ): Promise<Record<string, string>>;
  /** ブラウザが直接 GET するための URL */
  presign(
    key: string,
    opts?: { inline?: boolean; contentType?: string; bucket?: string },
  ): Promise<string>;
}
