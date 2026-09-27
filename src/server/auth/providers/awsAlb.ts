import { albKeyResolver } from '../keys'
import type { KeyResolver } from '../provider'
import { JwtProvider } from './jwtBase'

/**
 * AWS Application Load Balancer の認証アクション（Cognito または任意の OIDC IdP。Google も可）。
 * x-amzn-oidc-data に ALB が ES256 で署名した JWT が付く。IAM ではなく ALB の機能
 */
export class AwsAlbProvider extends JwtProvider {
  readonly name = 'aws_alb'
  protected readonly headerName = 'x-amzn-oidc-data'
  protected readonly algorithms = ['ES256']
  private readonly region: string
  private readonly arn: string | undefined

  constructor(opts: { region: string | undefined; arn?: string; adminEmails: readonly string[]; keyResolver?: KeyResolver }) {
    if (!opts.region) throw new Error('ALB_REGION (or AWS_REGION) is required for AUTH_PROVIDER=aws_alb')
    super(opts.adminEmails, opts.keyResolver ?? albKeyResolver(opts.region, opts.arn))
    this.region = opts.region
    this.arn = opts.arn
  }

  override describe() {
    return { ...super.describe(), region: this.region, albArn: this.arn ?? null }
  }
}
