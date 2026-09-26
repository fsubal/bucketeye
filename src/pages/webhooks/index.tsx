import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deleteWebhook, listDeliveries, listWebhooks, pingWebhook, updateWebhook } from '@/api/webhooks'
import { WebhookForm } from '@/components/WebhookForm'
import type { WebhookPublic } from '@/domains/Webhook/model'
import { formatDate } from '@/utils/format'

export default function WebhooksIndex() {
  const q = useQuery({ queryKey: ['webhooks'], queryFn: listWebhooks })
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Webhook</h1>
      <p className="mb-4 text-sm text-gray-600">
        承認ステータスの変更やコメントの投稿を、登録した URL に HMAC 署名付きで POST します。配送は失敗すると 1 分 → 5 分 → 30 分 … と間隔を広げて最大 8 回まで再送します。
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <div className="space-y-3">
          {q.isPending && <p className="text-sm text-gray-500">読み込み中…</p>}
          {q.isError && <p className="text-sm text-red-700">{q.error.message}</p>}
          {q.data?.length === 0 && <p className="text-sm text-gray-500">まだ登録がありません</p>}
          {q.data?.map((w) => <WebhookRow key={w.id} webhook={w} />)}
        </div>
        <WebhookForm />
      </div>
    </>
  )
}

function WebhookRow({ webhook }: { webhook: WebhookPublic }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['webhooks'] })
  const toggle = useMutation({ mutationFn: () => updateWebhook(webhook.id, { active: !webhook.active }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: () => deleteWebhook(webhook.id), onSuccess: invalidate })
  const ping = useMutation({ mutationFn: () => pingWebhook(webhook.id), onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: ['deliveries', webhook.id] }), 3000) })
  const deliveries = useQuery({ queryKey: ['deliveries', webhook.id], queryFn: () => listDeliveries(webhook.id), enabled: open, refetchInterval: open ? 5000 : false })

  return (
    <section className={`rounded border bg-white p-4 text-sm ${webhook.active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all font-medium">{webhook.url}</p>
          <p className="text-xs text-gray-500">
            {webhook.events.map((e) => (
              <code key={e} className="mr-2">
                {e}
              </code>
            ))}
            · secret {webhook.secret_hint} · {webhook.created_by} · {formatDate(webhook.created_at)}
            {!webhook.active && <span className="ml-2 rounded bg-gray-200 px-1.5 text-gray-700">無効</span>}
          </p>
          {webhook.description && <p className="mt-1 text-gray-700">{webhook.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => ping.mutate()} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">
            テスト配送
          </button>
          <button type="button" onClick={() => toggle.mutate()} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">
            {webhook.active ? '無効にする' : '有効にする'}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">
            配送履歴
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('この Webhook を削除しますか？')) remove.mutate()
            }}
            className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
          >
            削除
          </button>
        </div>
      </div>
      {open && (
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">イベント</th>
              <th className="py-1">試行</th>
              <th className="py-1">結果</th>
              <th className="py-1">次回</th>
              <th className="py-1">作成</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-gray-500">
                  配送はまだありません
                </td>
              </tr>
            )}
            {deliveries.data?.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-1">
                  <code>{d.event_type}</code>
                </td>
                <td className="py-1">{d.attempts}</td>
                <td className="py-1">
                  {d.delivered_at ? (
                    <span className="text-green-700">配送済 ({d.last_status})</span>
                  ) : d.dead_at ? (
                    <span className="text-red-700" title={d.last_error ?? ''}>
                      断念 ({d.last_error})
                    </span>
                  ) : (
                    <span className="text-amber-700" title={d.last_error ?? ''}>
                      {d.attempts === 0 ? '待機中' : `再送待ち (${d.last_error})`}
                    </span>
                  )}
                </td>
                <td className="py-1">{formatDate(d.next_attempt_at)}</td>
                <td className="py-1">{formatDate(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
