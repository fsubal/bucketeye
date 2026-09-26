import type { Context } from 'hono'
import type { JWTVerifyGetKey } from 'jose'
import type { Identity } from '@/domains/Identity/model'

/**
 * 認証は前段のプロキシに委譲する（Trusted Header 方式）。アプリはプロキシが付けたヘッダから身元を取り出すだけ。
 * JWT を付けるプロキシでは必ず署名を検証し、メールアドレスのヘッダ単体は信用しない
 */
export interface AuthProvider {
  readonly name: string
  identify(c: Context): Promise<Identity | null>
  /** 未認証時に誘導する先。プロキシ方式では null（プロキシが先に弾くので、ここに来るのは設定ミス） */
  readonly loginPath: string | null
  /** /me で見せる、秘密でない設定 */
  describe(): Record<string, unknown>
}

/** テストで差し込むための鍵解決。jose の jwtVerify に渡す関数 */
export type KeyResolver = JWTVerifyGetKey
