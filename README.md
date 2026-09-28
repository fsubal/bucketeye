# bucketeye

S3 互換ストレージ（Amazon S3 / MinIO / RustFS / Ceph RGW / Google Cloud Storage）に **すでにあるオブジェクト** を人間がレビューするための、セルフホスト可能な単独アプリケーションです。ファイルを自分のところにアップロードさせるのではなく、既存のバケットをそのまま覗き、コメントと承認ステータスをバケット側に書き戻します。いわば「Box のヘッドレス版」です。

- **S3 が真実の源。** コメントは W3C Web Annotation の JSON としてバケット内のサイドカー（`.review/`）に、承認ステータスはオブジェクトタグ（タグのない GCS ではサイドカー）に保存します。アプリ側の SQLite は一覧・検索用の索引と Webhook の配送キューで、消えても S3 から作り直せます。
- **認証は前段のプロキシに委譲。** Google IAP / AWS ALB 認証 / Cloudflare Access / oauth2-proxy が付ける身元をそのまま使います。ユーザーテーブルもログイン画面もありません。
- **1 コンテナ。** Web UI、JSON API、S3 のポーリング、Webhook の配送が同じ Node.js プロセスで動きます（Hono + `node:sqlite` + React）。既存の docker-compose にサービスをひとつ足すだけで導入できます。

Rails で作った PoC（[fsubal/s3review](https://github.com/fsubal/s3review)）を TypeScript で書き直したもので、こちらが本実装です。

## 試す

```sh
docker compose up --build
```

- http://localhost:3000 — アプリ。デモ用の `developer` 認証なので任意のメールでログインできます（`admin@example.com` が admin）
- http://localhost:9001 — S3 互換ストレージ（RustFS）のコンソール（rustfsadmin / rustfsadmin）

`scripts/sample/` の中身が `s3://manuscripts/submissions/` に投入され、起動時の再索引で一覧に出ます。詳細画面でコメントを書き、承認ボタンを押すと、ストレージ側のオブジェクトタグに `review-status=approved` が付きます:

```sh
curl -s -H "Authorization: Bearer demo-admin-token" \
  http://localhost:3000/api/v1/admin/storage/submissions/2026-10-issue/cover.png
```

サンプルの投入は compose の `seed` サービス（公式の `amazon/aws-cli` の `aws s3 sync`）が行います。同じファイルは送り直さないので、何度起動しても承認ステータスのタグは消えません。

## 自分の compose に足す

```yaml
services:
  bucketeye:
    image: <ビルドしたイメージ>
    ports: ["3000:3000"]
    environment:
      S3_ENDPOINT: http://minio:9000 # AWS S3 なら不要
      S3_PUBLIC_ENDPOINT: https://files.example.com # ブラウザから見えるホスト
      S3_REGION: us-east-1
      S3_BUCKET: my-bucket
      S3_ACCESS_KEY_ID: ...
      S3_SECRET_ACCESS_KEY: ...
      TARGET_PREFIX: uploads/
      AUTH_PROVIDER: forwarded_header # 前段の認証プロキシに合わせる（下記）
      ADMIN_EMAILS: you@example.com
      API_TOKENS: <長いランダム文字列>
      PUBLIC_URL: https://review.example.com # Webhook のペイロードに入れるリンクの元
    volumes:
      - bucketeye-data:/data # SQLite。消えても再索引で復元される（未配送の Webhook だけは失われる）
```

すべての環境変数は `.env.example` にまとめてあります。

## 認証（AUTH_PROVIDER）

アプリ自身はログインを実装せず、前段のプロキシが付けるヘッダから身元を取ります。JWT を付けるプロキシでは **必ず署名を検証** し、メールアドレスのヘッダ単体は信用しません（ヘッダ偽装対策）。

| `AUTH_PROVIDER`     | 前段                                                         | 必要な設定                                                                                                                        | 備考                                                                                               |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `gcp_iap`           | Google Cloud Identity-Aware Proxy                            | `IAP_AUDIENCE`（`/projects/<番号>/global/backendServices/<ID>`。Cloud Console の IAP 画面 → 「JWT オーディエンス コードを取得」） | `X-Goog-IAP-JWT-Assertion` を ES256 で検証                                                         |
| `aws_alb`           | ALB の認証アクション（Cognito または OIDC IdP。Google も可） | `ALB_REGION`、任意で `ALB_ARN`                                                                                                    | `x-amzn-oidc-data` を ALB のリージョン別公開鍵で検証。IAM ではなく ALB の機能です                  |
| `cloudflare_access` | Cloudflare Access                                            | `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`                                                                                          | `Cf-Access-Jwt-Assertion` を RS256 で検証                                                          |
| `forwarded_header`  | oauth2-proxy / Pomerium / Authelia / Authentik               | 任意で `AUTH_EMAIL_HEADER`（既定 `X-Forwarded-Email`）                                                                            | **署名がない。** アプリにプロキシ以外から到達できないネットワーク構成が前提                        |
| `developer`         | なし                                                         | `SECRET_KEY`                                                                                                                      | 開発・デモ専用。production では `AUTH_ALLOW_DEVELOPER_IN_PRODUCTION=true` を明示しないと起動しない |

設定が合っているかは `/whoami` で確認できます（届いている認証ヘッダと、誰として見えているかを表示）。oauth2-proxy を前段に置く構成例は `compose.oauth2-proxy.yml` にあります。

認証済みのユーザーは全員 reviewer（コメント・承認ができる）。`ADMIN_EMAILS` に含まれる人だけ admin（Webhook の管理、再索引の手動実行）。

## データの置き場所

```
s3://<S3_BUCKET>/
├── <TARGET_PREFIX>...                         レビュー対象（読み取り + タグ書き込みのみ）
│     tag: review-status = pending | approved | changes_requested | rejected
│     tag: review-updated-at = <ISO8601>,  review-reviewer = <email>
└── <REVIEW_PREFIX>                             既定 .review/（REVIEW_BUCKET で別バケットにもできる）
    ├── objects/<sha256(key)>/
    │   ├── comments/<ULID>.json               コメント 1 件 = 1 オブジェクト（W3C Web Annotation）
    │   └── status.json                        STATUS_STRATEGY=sidecar のときだけ
    └── webhooks/<ULID>.json                   Webhook の登録（署名用 secret を含む。REVIEW_BUCKET の権限に注意）
```

- コメントは追記のみなので同時書き込みで競合しません。
- `STATUS_STRATEGY=tags` は PutObjectTagging を使うので、オブジェクト本体をコピーせずに更新できます。既存のタグは壊しません。
- GCS にはタグがないので `STATUS_STRATEGY=sidecar` を使ってください。

コメントの JSON 例:

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "urn:ulid:01M3EC16S3B3DKA96QA5EV0TX1",
  "type": "Annotation",
  "motivation": "commenting",
  "created": "2026-09-26T08:00:00Z",
  "creator": {
    "type": "Person",
    "email": "alice@example.com",
    "name": "Alice"
  },
  "body": {
    "type": "TextualBody",
    "value": "表紙の色味を確認してください",
    "format": "text/plain"
  },
  "target": { "source": "s3://manuscripts/submissions/2026-10-issue/cover.png" }
}
```

コメントには位置を付けられます。位置は `target.selector` の `FragmentSelector` に、既存の標準の書式で入ります（変換と検証は `src/domains/Annotation/position.ts`）。

| ファイル   | 画面での指定                             | `value` の例                                 | `conformsTo`                                           |
| ---------- | ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| 画像       | 「範囲を指定」を押して画像の上をドラッグ | `xywh=percent:10,20,30,40`（画像に対する %） | Media Fragments（`http://www.w3.org/TR/media-frags/`） |
| 動画・音声 | 止めた所で「この時刻を指定」             | `t=65.2`                                     | Media Fragments                                        |
| PDF        | ページ番号を入れて「このページを指定」   | `page=3`                                     | RFC 8118（`http://tools.ietf.org/rfc/rfc8118`）        |
| テキスト   | 行番号を押す（Shift で範囲）             | `line=9,12`（10〜12 行目）                   | RFC 5147（`http://tools.ietf.org/rfc/rfc5147`）        |

API で投稿するときも同じ形の `selector` を渡せます。読めない値や、ファイルの種類に合わない位置（画像に `page=` など）は `validation-failed`（`errors[].pointer` が `#/selector`）になります。コメント欄の位置のチップを押すと、プレビューがその位置を示します（画像なら枠を強調、動画ならその時刻へ移動、PDF ならそのページを開く、テキストならその行へスクロール）。

## JSON API

`Authorization: Bearer <トークン>`、またはブラウザと同じ前段プロキシの身元で認証します。トークンは `API_TOKENS` なら reviewer、`ADMIN_API_TOKENS` なら admin として扱います。

エラーは RFC 9457 の Problem Details（`application/problem+json`）です。汎用のエラーは `type: "about:blank"` と HTTP の標準フレーズの `title`、アプリ固有のエラー（認証が必要、admin が必要、入力の検証エラーなど）は固有の `type` URI を持ちます。種類と拡張メンバー（`errors`、`loginPath`）は [docs/problems.md](docs/problems.md) にあります。

レスポンスのキーはすべて camelCase です（`contentType`、`statusUpdatedAt` など）。例外はコメントの W3C Web Annotation 形式で、キーは仕様どおり（`@context`、`conformsTo` など）です。ステータス値（`changes_requested`）やイベント名（`object.status_changed`）は値なので snake_case のままです。

| メソッド                    | パス                                                                                            | 説明                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                         | `/api/v1/objects?prefix=2026/&status=approved&updatedSince=2026-09-01T00:00:00Z&page=1&per=100` | オブジェクト一覧（索引から返す）。`status` か `updatedSince`（承認ステータスがその時刻以降に更新されたもの。ISO 8601 の日時でタイムゾーン必須）を付けるとフォルダを無視して平らに並べる |
| GET                         | `/api/v1/objects/<key>`                                                                         | 1 件（S3 から読み直す）+ コメント + プレビュー用 URL                                                                                                                                    |
| GET                         | `/api/v1/texts/<key>`                                                                           | テキストプレビュー（先頭 256KB）                                                                                                                                                        |
| GET / POST                  | `/api/v1/comments/<key>`                                                                        | コメント一覧 / 投稿 `{ "body": "...", "selector"?: ... }`                                                                                                                               |
| PUT                         | `/api/v1/statuses/<key>`                                                                        | 承認ステータス `{ "status": "approved" }`                                                                                                                                               |
| GET / POST / PATCH / DELETE | `/api/v1/webhooks[/<id>]`                                                                       | Webhook の登録（admin）                                                                                                                                                                 |
| GET                         | `/api/v1/webhooks/<id>/deliveries`                                                              | 配送履歴                                                                                                                                                                                |
| POST                        | `/api/v1/webhooks/<id>/ping`                                                                    | テスト配送                                                                                                                                                                              |
| POST                        | `/api/v1/admin/reindex?wait=true`                                                               | 再索引を今すぐ（admin）。`wait=true` なら終わるまで待って件数を返す（無ければ 202 で即返す）                                                                                            |
| GET                         | `/api/v1/admin/storage/<key>`                                                                   | S3 に実際に置かれているもの（タグ、`status.json`、コメントのサイドカー）を見る（admin）                                                                                                 |
| GET                         | `/api/v1/me` / `/api/v1/config`                                                                 | 身元と設定                                                                                                                                                                              |

キーはスラッシュを含むので、動詞つきの操作は `/objects/<key>/comments` のような後置きではなく `/comments/<key>` のように別の名前空間になっています。

```sh
curl -H "Authorization: Bearer demo-api-token" "http://localhost:3000/api/v1/objects?status=approved"
```

## Webhook

admin が UI（`/webhooks`）または API で URL とイベント（`object.status_changed` / `comment.created`）を登録すると、該当する操作のたびに JSON を POST します。

- ヘッダ: `X-Bucketeye-Event`（イベント種別）、`X-Bucketeye-Delivery`（配送 ID）、`X-Bucketeye-Signature: sha256=<HMAC-SHA256(secret, body) の hex>`
- 2xx 以外や接続失敗は再送します。間隔は 1 分 → 5 分 → 30 分 → 2 時間 → 12 時間 → 24 時間 ×3 で、8 回で断念します。
- 配送キューは SQLite にあります。`/data` を消すと未配送分は失われます（登録そのものは S3 にあるので残ります）。

受け口の例（署名を検証してログに出す）:

```sh
WEBHOOK_SECRET=<登録時に表示された secret> node scripts/webhook-receiver.mjs 4000
# FAIL=1 を付けると 500 を返すので再送を試せる
```

ペイロード例:

```json
{
  "id": "01M3ED...",
  "type": "object.status_changed",
  "createdAt": "2026-09-26T08:10:00Z",
  "url": "https://review.example.com/objects/submissions/2026-10-issue/cover.png",
  "data": {
    "bucket": "manuscripts",
    "key": "submissions/2026-10-issue/cover.png",
    "status": "approved",
    "previousStatus": "pending",
    "reviewer": "alice@example.com",
    "object": {
      "key": "...",
      "status": "approved",
      "contentType": "image/png",
      "...": "..."
    }
  }
}
```

## 索引（SQLite）について

一覧・フィルタを速くするため、`TARGET_PREFIX` 以下をクロールして SQLite に写しています。ORM もジョブキューも使っていません。

- 起動時（`REINDEX_ON_BOOT`）と定期（`REINDEX_EVERY`、既定 10 分）にクロールが走ります。手動なら admin で一覧画面の「再索引」、または `POST /api/v1/admin/reindex?wait=true`（開発中は下の `npm run api`）。
- 詳細画面を開いたときはその 1 件を S3 から読み直すので、索引が古くても詳細は常に最新です。
- タグ戦略では 1 オブジェクトごとに GetObjectTagging が飛びます。数千件までは問題ありませんが、それ以上は S3 イベント通知や S3 Inventory による差分更新を検討してください（未実装）。

## 開発

```sh
mise install                 # node 24
npm install
docker compose up -d s3 seed # ストレージとサンプルデータだけ立てる
cp .env.example .env         # S3_BUCKET=manuscripts TARGET_PREFIX=submissions/ S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY_ID=rustfsadmin S3_SECRET_ACCESS_KEY=rustfsadmin
npm run dev                  # Hono(3000) + Vite(5173)。ブラウザは http://localhost:5173
```

```sh
npm test                     # vitest。S3 はインメモリ、SQLite は :memory:
S3_TEST_ENDPOINT=http://localhost:9000 S3_TEST_ACCESS_KEY_ID=rustfsadmin S3_TEST_SECRET_ACCESS_KEY=rustfsadmin npm test -- src/server/s3/aws.test.ts
npm run typecheck            # web / server の 2 プロジェクト
npm run format               # Prettier（設定は .prettierrc.json。VS Code の formatOnSave と同じ）
npm run format:check
npm run lint                 # ESLint（Tailwind のクラスを clsx で 1 つずつ書く、など）
npm run lint:fix             # 自動修正。clsx の import は足されないので、後で npm run typecheck を通す
npm run build                # dist/web（Vite）+ dist/server.js（esbuild、依存同梱）
```

API の確認にはサーバを立てずに [Hono CLI](https://github.com/honojs/cli) の `hono request` を使えます。`npm run api` は `src/index.ts`（サーバ起動やポーリングをしない、app だけを組むエントリ）に対してリクエストを投げます。環境変数は `.env` から読みます。

```sh
npm run api -- -P /api/v1/objects -H "Authorization: Bearer $API_TOKEN"
npm run api -- -X POST -P "/api/v1/admin/reindex?wait=true" -H "Authorization: Bearer $ADMIN_API_TOKEN"
npm run api -- -P /api/v1/admin/storage/submissions/2026-10-issue/cover.png -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

S3 と SQLite（`DATA_DIR`）は本物を使うので、稼働中のサーバと同じ状態が見えます。本番のコンテナには Hono CLI もソースも入っていないので、稼働中のサーバには同じパスを curl で叩いてください。

Tailwind のクラスは `className="a b c"` と並べず、`clsx("a", "b", "c")` と 1 つずつ書きます（[eslint-plugin-classnames](https://github.com/fsubal/eslint-plugin-classnames)）。ESLint のパーサは Babel です。typescript-eslint がまだ TypeScript 7 に対応していないためで、型の検査は `npm run typecheck` が担います。

コードの書式は Prettier に任せています。VS Code は保存時に、Claude Code は編集のたびに（`.claude/settings.json` の PostToolUse フックで）同じ `.prettierrc.json` で整形するので、どちらが書いても差分が出ません。

ディレクトリ構成は `src/domains`（zod スキーマ。型の正。サーバと Web が共有）、`src/api`（Web の API クライアント）、`src/components`、`src/pages`、`src/utils`、`src/server`（Hono。`domains` と `utils` だけを import する）です。

## 今後

1. 位置指定コメントの拡張: PDF のページ内の範囲（PDF.js の組み込みが要る）、動画の時間範囲（`t=10,20`。保存と表示はすでに対応）、動画のフレーム上の範囲
2. OIDC 直結（前段プロキシなしで動かしたい人向け）、GCS メタデータへの書き戻し、S3 イベント通知による差分索引
