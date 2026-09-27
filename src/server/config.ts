import { z } from "zod";
import { normalizePrefix } from "@/domains/ReviewedObject/model";

/**
 * 環境変数から組み立てる設定。名前は Rails 版 s3review と同じにしてある（README の env 一覧と対応）。
 * 起動時に一度だけパースし、不備はメッセージを出して即終了する
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? def : v === "true" || v === "1",
    );

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** "10m" / "30s" / "1h" / 秒数 → 秒 */
export function parseDurationSeconds(input: string): number {
  const m =
    /^\s*(\d+)\s*(s|m|h|d)?\s*$/.exec(input) ??
    /^\s*every\s+(\d+)\s*(second|minute|hour|day)s?\s*$/.exec(input);
  if (!m) throw new Error(`invalid duration: ${input}`);
  const n = Number(m[1]);
  const unit = (m[2] ?? "s")[0];
  return (
    n * ({ s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[unit!]!
  );
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  PUBLIC_URL: z.string().optional(),
  SECRET_KEY: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  TARGET_PREFIX: z.string().default(""),
  REVIEW_BUCKET: z.string().optional(),
  REVIEW_PREFIX: z.string().default(".review/"),
  STATUS_STRATEGY: z.enum(["tags", "sidecar"]).default("tags"),
  PRESIGN_EXPIRES_IN: z.coerce.number().int().positive().default(900),

  AUTH_PROVIDER: z
    .enum([
      "gcp_iap",
      "aws_alb",
      "cloudflare_access",
      "forwarded_header",
      "developer",
    ])
    .optional(),
  ADMIN_EMAILS: list,
  API_TOKENS: list,
  ADMIN_API_TOKENS: list,
  IAP_AUDIENCE: z.string().optional(),
  ALB_REGION: z.string().optional(),
  AWS_REGION: z.string().optional(),
  ALB_ARN: z.string().optional(),
  CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
  CF_ACCESS_AUD: z.string().optional(),
  AUTH_EMAIL_HEADER: z.string().default("X-Forwarded-Email"),
  AUTH_NAME_HEADER: z.string().default("X-Forwarded-Preferred-Username"),
  AUTH_ALLOW_DEVELOPER_IN_PRODUCTION: bool(false),

  REINDEX_ON_BOOT: bool(true),
  REINDEX_EVERY: z.string().default("10m"),
  WEBHOOK_WORKER_INTERVAL: z.string().default("2s"),
});

export type Config = ReturnType<typeof buildConfig>;

export function buildConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`invalid configuration:\n${issues}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  const endpoint = e.S3_ENDPOINT || undefined;
  const reviewBucket = e.REVIEW_BUCKET || e.S3_BUCKET;
  const reviewPrefix = normalizePrefix(e.REVIEW_PREFIX);
  if (reviewBucket === e.S3_BUCKET && reviewPrefix === "") {
    throw new Error(
      "REVIEW_PREFIX must not be empty when REVIEW_BUCKET is the target bucket",
    );
  }
  const authProvider =
    e.AUTH_PROVIDER ?? (production ? undefined : "developer");
  if (!authProvider) {
    throw new Error(
      "AUTH_PROVIDER is required in production (gcp_iap | aws_alb | cloudflare_access | forwarded_header | developer)",
    );
  }
  if (
    authProvider === "developer" &&
    production &&
    !e.AUTH_ALLOW_DEVELOPER_IN_PRODUCTION
  ) {
    throw new Error(
      "AUTH_PROVIDER=developer is for development only. Set AUTH_ALLOW_DEVELOPER_IN_PRODUCTION=true if this is a demo.",
    );
  }

  return {
    production,
    port: e.PORT,
    host: e.HOST,
    dataDir: e.DATA_DIR,
    publicUrl: e.PUBLIC_URL?.replace(/\/+$/, "") || null,
    secretKey:
      e.SECRET_KEY || (production ? null : "bucketeye-development-secret-key"),
    s3: {
      endpoint,
      publicEndpoint: e.S3_PUBLIC_ENDPOINT || endpoint,
      region: e.S3_REGION,
      accessKeyId: e.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle:
        e.S3_FORCE_PATH_STYLE === undefined || e.S3_FORCE_PATH_STYLE === ""
          ? Boolean(endpoint)
          : e.S3_FORCE_PATH_STYLE === "true",
      bucket: e.S3_BUCKET,
      targetPrefix: e.TARGET_PREFIX.replace(/^\/+/, ""),
      reviewBucket,
      reviewPrefix,
      statusStrategy: e.STATUS_STRATEGY,
      presignExpiresIn: e.PRESIGN_EXPIRES_IN,
      /** サイドカーが同じバケットにあるとき、一覧から除外すべきか */
      reviewPrefixInTargetBucket: reviewBucket === e.S3_BUCKET,
    },
    auth: {
      provider: authProvider,
      adminEmails: e.ADMIN_EMAILS,
      apiTokens: e.API_TOKENS,
      adminApiTokens: e.ADMIN_API_TOKENS,
      iapAudience: e.IAP_AUDIENCE,
      albRegion: e.ALB_REGION || e.AWS_REGION,
      albArn: e.ALB_ARN,
      cfTeamDomain: e.CF_ACCESS_TEAM_DOMAIN?.replace(
        /^https?:\/\//,
        "",
      ).replace(/\/+$/, ""),
      cfAudience: e.CF_ACCESS_AUD,
      emailHeader: e.AUTH_EMAIL_HEADER,
      nameHeader: e.AUTH_NAME_HEADER,
    },
    reindexOnBoot: e.REINDEX_ON_BOOT,
    reindexEverySeconds: parseDurationSeconds(e.REINDEX_EVERY),
    webhookWorkerIntervalSeconds: parseDurationSeconds(
      e.WEBHOOK_WORKER_INTERVAL,
    ),
  };
}
