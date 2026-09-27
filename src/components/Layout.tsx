import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { devLogout, getConfig, type Me } from '@/api/session'
import { ME_QUERY_KEY } from './RequireAuth'

export function Layout({ me, children }: { me: Me | null; children: ReactNode }) {
  const config = useQuery({ queryKey: ['config'], queryFn: getConfig, staleTime: Infinity, enabled: me !== null })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: devLogout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_QUERY_KEY })
      navigate('/dev/login')
    },
  })

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/objects" className="text-lg font-semibold">
              bucketeye
            </Link>
            {config.data && (
              <span className="text-sm text-gray-500">
                s3://{config.data.bucket}/{config.data.targetPrefix}
              </span>
            )}
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {me?.identity.role === 'admin' && (
              <Link to="/webhooks" className="text-gray-700 hover:underline">
                Webhook
              </Link>
            )}
            {me && (
              <Link to="/whoami" className="text-gray-700 hover:underline" title={`provider: ${me.identity.provider}`}>
                {me.identity.email}
                {me.identity.role === 'admin' && <span className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-white">admin</span>}
              </Link>
            )}
            {me?.identity.provider === 'developer' && (
              <button type="button" className="text-gray-500 hover:underline" onClick={() => logout.mutate()}>
                ログアウト
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
