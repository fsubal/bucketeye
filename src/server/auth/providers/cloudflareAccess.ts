import { jwksResolver } from '../keys'
import type { KeyResolver } from '../provider'
import { JwtProvider } from './jwtBase'

/** Cloudflare Access。Cf-Access-Jwt-Assertion に RS256 の JWT が付く */
export class CloudflareAccessProvider extends JwtProvider {
  readonly name = 'cloudflare_access'
  protected readonly headerName = 'Cf-Access-Jwt-Assertion'
  protected readonly algorithms = ['RS256']
  protected override readonly issuer: string
  protected override readonly audience: string

  constructor(opts: { teamDomain: string | undefined; audience: string | undefined; adminEmails: readonly string[]; keyResolver?: KeyResolver }) {
    if (!opts.teamDomain) throw new Error('CF_ACCESS_TEAM_DOMAIN is required for AUTH_PROVIDER=cloudflare_access')
    if (!opts.audience) throw new Error('CF_ACCESS_AUD is required for AUTH_PROVIDER=cloudflare_access')
    super(opts.adminEmails, opts.keyResolver ?? jwksResolver(`https://${opts.teamDomain}/cdn-cgi/access/certs`))
    this.issuer = `https://${opts.teamDomain}`
    this.audience = opts.audience
  }
}
