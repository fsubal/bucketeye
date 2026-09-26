import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { Identity } from '@/domains/Identity/model'
import { makeIdentity } from '../identity'
import type { AuthProvider } from '../provider'

const COOKIE = 'bucketeye_dev_identity'

/** 開発・デモ専用。POST /api/v1/dev/session でメールを入れるだけでその人になれる（署名付き Cookie） */
export class DeveloperProvider implements AuthProvider {
  readonly name = 'developer'
  readonly loginPath = '/dev/login'

  constructor(
    private readonly secret: string,
    private readonly adminEmails: readonly string[],
    private readonly secureCookie: boolean,
  ) {}

  async identify(c: Context): Promise<Identity | null> {
    const raw = await getSignedCookie(c, this.secret, COOKIE)
    if (!raw) return null
    try {
      const data = JSON.parse(raw) as { email?: string; name?: string | null }
      return data.email ? makeIdentity({ email: data.email, name: data.name ?? null, provider: this.name }, this.adminEmails) : null
    } catch {
      return null
    }
  }

  async signIn(c: Context, email: string, name: string | null): Promise<void> {
    await setSignedCookie(c, COOKIE, JSON.stringify({ email, name }), this.secret, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: this.secureCookie,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
  }

  signOut(c: Context): void {
    deleteCookie(c, COOKIE, { path: '/' })
  }

  describe() {
    return { provider: this.name, warning: 'anyone can sign in as anyone; development and demo only' }
  }
}
