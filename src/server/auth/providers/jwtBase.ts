import type { Context } from 'hono'
import { jwtVerify, type JWTVerifyOptions } from 'jose'
import type { Identity } from '@/domains/Identity/model'
import { makeIdentity } from '../identity'
import type { AuthProvider, KeyResolver } from '../provider'

/** 署名付き JWT をヘッダで受け取るプロバイダの共通部分 */
export abstract class JwtProvider implements AuthProvider {
  abstract readonly name: string
  readonly loginPath = null
  protected abstract readonly headerName: string
  protected abstract readonly algorithms: string[]
  protected readonly issuer: string | undefined = undefined
  protected readonly audience: string | undefined = undefined

  constructor(
    protected readonly adminEmails: readonly string[],
    private readonly keyResolver: KeyResolver,
  ) {}

  async identify(c: Context): Promise<Identity | null> {
    const token = c.req.header(this.headerName)
    if (!token) return null
    try {
      const options: JWTVerifyOptions = { algorithms: this.algorithms }
      if (this.issuer) options.issuer = this.issuer
      if (this.audience) options.audience = this.audience
      const { payload } = await jwtVerify(token, this.keyResolver, options)
      return makeIdentity(
        { email: String(payload['email'] ?? ''), name: typeof payload['name'] === 'string' ? payload['name'] : null, provider: this.name },
        this.adminEmails,
      )
    } catch (e) {
      console.warn(`[auth:${this.name}] rejected token: ${(e as Error).message}`)
      return null
    }
  }

  describe(): Record<string, unknown> {
    return { provider: this.name, header: this.headerName, algorithms: this.algorithms, issuer: this.issuer, audience: this.audience }
  }
}
