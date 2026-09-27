import type { Context } from 'hono'
import type { Identity } from '@/domains/Identity/model'
import { makeIdentity } from '../identity'
import type { AuthProvider } from '../provider'

/**
 * oauth2-proxy / Pomerium / Authelia / Authentik などのフォワード認証プロキシ。
 * メールが平文ヘッダで来るだけで署名はないので、アプリにプロキシ以外から到達できないネットワーク構成が前提
 */
export class ForwardedHeaderProvider implements AuthProvider {
  readonly name = 'forwarded_header'
  readonly loginPath = null

  constructor(private readonly opts: { emailHeader: string; nameHeader: string; adminEmails: readonly string[] }) {}

  async identify(c: Context): Promise<Identity | null> {
    const email = c.req.header(this.opts.emailHeader)
    if (!email) return null
    return makeIdentity({ email, name: c.req.header(this.opts.nameHeader) ?? null, provider: this.name }, this.opts.adminEmails)
  }

  describe() {
    return {
      provider: this.name,
      emailHeader: this.opts.emailHeader,
      nameHeader: this.opts.nameHeader,
      warning: 'headers are not signed; restrict network access to the proxy',
    }
  }
}
