import type { Config } from '../config'
import type { AuthProvider } from './provider'
import { AwsAlbProvider } from './providers/awsAlb'
import { CloudflareAccessProvider } from './providers/cloudflareAccess'
import { DeveloperProvider } from './providers/developer'
import { ForwardedHeaderProvider } from './providers/forwardedHeader'
import { GcpIapProvider } from './providers/gcpIap'

export function createAuthProvider(config: Config): AuthProvider {
  const a = config.auth
  switch (a.provider) {
    case 'gcp_iap':
      return new GcpIapProvider({ audience: a.iapAudience, adminEmails: a.adminEmails })
    case 'aws_alb':
      return new AwsAlbProvider({ region: a.albRegion, arn: a.albArn, adminEmails: a.adminEmails })
    case 'cloudflare_access':
      return new CloudflareAccessProvider({ teamDomain: a.cfTeamDomain, audience: a.cfAudience, adminEmails: a.adminEmails })
    case 'forwarded_header':
      return new ForwardedHeaderProvider({ emailHeader: a.emailHeader, nameHeader: a.nameHeader, adminEmails: a.adminEmails })
    case 'developer': {
      if (!config.secretKey) throw new Error('SECRET_KEY is required for AUTH_PROVIDER=developer in production')
      if (config.production) console.warn('[auth] developer provider is enabled: anyone can sign in as anyone')
      return new DeveloperProvider(config.secretKey, a.adminEmails, false)
    }
  }
}

export type { AuthProvider } from './provider'
