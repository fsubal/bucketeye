import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { getMe, type Me } from '@/api/session'
import { HttpError } from '@/utils/http'

export const ME_QUERY_KEY = ['me'] as const

/** /me の結果。Layout や各ページからも同じキャッシュを読む */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: getMe, retry: false, staleTime: 60_000 })
}

/** 未認証なら developer はログイン画面へ、それ以外は「認証ヘッダが届いていません」を出す */
export function RequireAuth({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <p className="p-6 text-sm text-gray-500">読み込み中…</p>
  if (me.isError) {
    const e = me.error
    if (e instanceof HttpError && e.status === 401) {
      if (e.loginPath) return <Navigate to={e.loginPath} replace state={{ from: location.pathname }} />
      return <Unauthenticated extra={e.extra} />
    }
    return <p className="p-6 text-sm text-red-700">エラー: {e.message}</p>
  }
  return <>{children(me.data)}</>
}

function Unauthenticated({ extra }: { extra: Record<string, unknown> }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded border border-red-200 bg-white p-6 text-sm">
      <h1 className="mb-2 text-lg font-semibold text-red-800">認証情報が届いていません</h1>
      <p className="mb-3 text-gray-700">
        このアプリは前段のプロキシ（Google IAP / AWS ALB / Cloudflare Access / oauth2-proxy）が付ける認証ヘッダを前提にしています。
        プロキシを経由せずにアクセスしているか、プロキシの設定（audience など）が合っていない可能性があります。
      </p>
      <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(extra, null, 2)}</pre>
    </div>
  )
}
