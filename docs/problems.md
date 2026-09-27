# Problem types

bucketeye の JSON API（`/api/v1`）はエラーを [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) の Problem Details（`Content-Type: application/problem+json`）で返します。

- 汎用のエラー（`404 Not Found`、`500 Internal Server Error` など）は `type` が `about:blank` で、`title` は HTTP の標準フレーズです。
- アプリ固有のエラーは、このページの見出しを指す `type` URI を持ちます（例 `https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#validation-failed`）。`title` は種類ごとに固定で、発生ごとの説明は `detail` に入ります。
- 見出しは `type` URI のフラグメントと一致させてあります。種類を増やすときは `src/domains/Problem/model.ts` の `PROBLEM_TYPES` とこのページを両方更新してください（テストで一致を確認しています）。

## authentication-required

|        |                         |
| ------ | ----------------------- |
| status | 401                     |
| title  | Authentication required |

リクエストに信頼できる身元がありません。前段のプロキシ（Google IAP / AWS ALB / Cloudflare Access / oauth2-proxy）を経由していないか、プロキシの設定（audience など）が合っていないか、`Authorization: Bearer` のトークンが `API_TOKENS` に含まれていません。

拡張メンバー:

- `loginPath`（string または null）: `AUTH_PROVIDER=developer` のときのログイン画面のパス。プロキシ方式では null。

```json
{
  "type": "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#authentication-required",
  "title": "Authentication required",
  "status": 401,
  "detail": "No trusted identity was found on this request.",
  "loginPath": null
}
```

## admin-required

|        |                           |
| ------ | ------------------------- |
| status | 403                       |
| title  | Admin privileges required |

Webhook の管理や再索引など、admin だけができる操作です。`ADMIN_EMAILS` に自分のメールアドレスを追加してください。

## invalid-query

|        |                          |
| ------ | ------------------------ |
| status | 400                      |
| title  | Invalid query parameters |

クエリパラメータが不正です。

拡張メンバー:

- `errors`（array）: パラメータごとのエラー。各要素は `detail`（説明）と `parameter`（パラメータ名）を持ちます。

```json
{
  "type": "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#invalid-query",
  "title": "Invalid query parameters",
  "status": 400,
  "detail": "status: Invalid option: expected one of \"pending\"|\"approved\"|\"changes_requested\"|\"rejected\"",
  "errors": [
    {
      "detail": "Invalid option: expected one of \"pending\"|\"approved\"|\"changes_requested\"|\"rejected\"",
      "parameter": "status"
    }
  ]
}
```

## validation-failed

|        |                                |
| ------ | ------------------------------ |
| status | 422                            |
| title  | Request body failed validation |

リクエスト本文（JSON）が不正です。

拡張メンバー:

- `errors`（array）: 項目ごとのエラー。各要素は `detail`（説明）と `pointer`（本文中の場所。[RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) の JSON Pointer を URI フラグメントで表したもの）を持ちます。

```json
{
  "type": "https://github.com/fsubal/bucketeye/blob/main/docs/problems.md#validation-failed",
  "title": "Request body failed validation",
  "status": 422,
  "detail": "コメントを入力してください",
  "errors": [{ "detail": "コメントを入力してください", "pointer": "#/body" }]
}
```
