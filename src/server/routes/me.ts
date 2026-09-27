import { Hono } from 'hono'
import type { AppEnv } from '../app'

/** 前段プロキシの設定確認用。値は見せない（JWT やメールが丸見えになる）。届いているかどうかだけ */
const AUTH_HEADERS = [
  'X-Goog-IAP-JWT-Assertion',
  'X-Goog-Authenticated-User-Email',
  'x-amzn-oidc-data',
  'x-amzn-oidc-identity',
  'Cf-Access-Jwt-Assertion',
  'Cf-Access-Authenticated-User-Email',
  'X-Forwarded-Email',
  'X-Forwarded-User',
  'X-Forwarded-Preferred-Username',
]

export function meRoutes() {
  const r = new Hono<AppEnv>()

  r.get('/me', (c) => {
    const { auth, config } = c.get('deps')
    return c.json({
      identity: c.get('identity'),
      provider: auth.describe(),
      loginPath: auth.loginPath,
      adminEmailsConfigured: config.auth.adminEmails.length > 0,
      headersPresent: AUTH_HEADERS.filter((h) => c.req.header(h) !== undefined),
    })
  })

  r.get('/config', (c) => {
    const { config } = c.get('deps')
    return c.json({ bucket: config.s3.bucket, targetPrefix: config.s3.targetPrefix, statusStrategy: config.s3.statusStrategy })
  })

  return r
}
