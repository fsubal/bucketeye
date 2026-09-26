import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { reindex } from '@/api/admin'
import { listObjects } from '@/api/objects'
import type { Me } from '@/api/session'
import { StatusBadge } from '@/components/StatusBadge'
import { breadcrumbsOf, REVIEW_STATUS_LABELS, REVIEW_STATUSES, ReviewStatus, type ReviewStatus as ReviewStatusT } from '@/domains/ReviewedObject/model'
import { formatBytes, formatDate } from '@/utils/format'
import { encodeKey } from '@/utils/http'

/** URL の ?prefix=&status=&page= を状態の正にする */
export default function ObjectsIndex({ me }: { me: Me }) {
  const [params] = useSearchParams()
  const prefix = params.get('prefix') ?? ''
  const statusParam = ReviewStatus.safeParse(params.get('status'))
  const status = statusParam.success ? statusParam.data : null
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const q = useQuery({ queryKey: ['objects', prefix, status, page], queryFn: () => listObjects({ prefix, status, page }) })
  const qc = useQueryClient()
  const reindexM = useMutation({ mutationFn: reindex, onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: ['objects'] }), 1500) })

  const href = (next: { prefix?: string; status?: ReviewStatusT | null; page?: number }) => {
    const p = new URLSearchParams()
    const pf = next.prefix ?? prefix
    const st = next.status === undefined ? status : next.status
    if (pf) p.set('prefix', pf)
    if (st) p.set('status', st)
    if (next.page && next.page > 1) p.set('page', String(next.page))
    const qs = p.toString()
    return `/objects${qs ? `?${qs}` : ''}`
  }

  if (q.isPending) return <p className="text-sm text-gray-500">読み込み中…</p>
  if (q.isError) return <p className="text-sm text-red-700">{q.error.message}</p>
  const data = q.data
  const total = Object.values(data.counts).reduce((a, b) => a + (b ?? 0), 0)
  const pages = Math.max(1, Math.ceil(data.pagination.total / data.pagination.per))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav className="text-sm">
          <Link to={href({ prefix: '' })} className="text-blue-700 hover:underline">
            /
          </Link>
          {breadcrumbsOf(prefix).map((b) => (
            <span key={b.prefix}>
              <span className="mx-1 text-gray-400">/</span>
              <Link to={href({ prefix: b.prefix })} className="text-blue-700 hover:underline">
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {data.last_index_run && (
            <span title={data.last_index_run.error ?? undefined}>
              最終索引: {formatDate(data.last_index_run.finished_at ?? data.last_index_run.started_at)}
              {data.last_index_run.error && <span className="ml-1 text-red-600">（失敗）</span>}
            </span>
          )}
          {me.identity.role === 'admin' && (
            <button type="button" onClick={() => reindexM.mutate()} disabled={reindexM.isPending} className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-50">
              再索引
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link to={href({ status: null })} className={`rounded px-3 py-1 ${status ? 'border border-gray-300 bg-white' : 'bg-gray-800 text-white'}`}>
          すべて {total}
        </Link>
        {REVIEW_STATUSES.map((s) => (
          <Link key={s} to={href({ status: s })} className={`rounded px-3 py-1 ${status === s ? 'bg-gray-800 text-white' : 'border border-gray-300 bg-white'}`}>
            {REVIEW_STATUS_LABELS[s]} {data.counts[s] ?? 0}
          </Link>
        ))}
      </div>

      {!data.indexed && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">索引がまだありません。</p>
          <p className="mt-1">起動時に再索引が走ります。数秒待ってから再読み込みしてください。</p>
        </div>
      )}

      <table className="w-full border-collapse overflow-hidden rounded border border-gray-200 bg-white text-sm">
        <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
          <tr>
            <th className="px-3 py-2">名前</th>
            <th className="px-3 py-2">ステータス</th>
            <th className="px-3 py-2">種類</th>
            <th className="px-3 py-2 text-right">サイズ</th>
            <th className="px-3 py-2">更新日時</th>
          </tr>
        </thead>
        <tbody>
          {data.folders.map((f) => (
            <tr key={f} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2" colSpan={5}>
                <Link to={href({ prefix: prefix + f })} className="text-blue-700 hover:underline">
                  📁 {f}
                </Link>
              </td>
            </tr>
          ))}
          {data.objects.map((o) => (
            <tr key={o.key} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link to={`/objects/${encodeKey(o.key)}`} className="text-blue-700 hover:underline">
                  {status ? o.key : o.name}
                </Link>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={o.status} />
              </td>
              <td className="px-3 py-2 text-gray-600">{o.content_type ?? '-'}</td>
              <td className="px-3 py-2 text-right text-gray-600">{formatBytes(o.size)}</td>
              <td className="px-3 py-2 text-gray-600">{formatDate(o.last_modified)}</td>
            </tr>
          ))}
          {data.folders.length === 0 && data.objects.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                オブジェクトがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link to={href({ page: page - 1 })} className="text-blue-700 hover:underline">
              ← 前
            </Link>
          )}
          <span className="text-gray-600">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link to={href({ page: page + 1 })} className="text-blue-700 hover:underline">
              次 →
            </Link>
          )}
        </nav>
      )}
    </>
  )
}
