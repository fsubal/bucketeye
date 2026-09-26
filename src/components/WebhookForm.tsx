import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createWebhook } from '@/api/webhooks'
import { WEBHOOK_EVENTS, type WebhookEventType } from '@/domains/Webhook/model'

export function WebhookForm() {
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [events, setEvents] = useState<WebhookEventType[]>(['object.status_changed'])
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null)
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => createWebhook({ url, events, description: description || undefined }),
    onSuccess: (w) => {
      setCreated({ id: w.id, secret: w.secret })
      setUrl('')
      setDescription('')
      void qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const toggle = (ev: WebhookEventType) => setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))

  return (
    <section className="rounded border border-gray-200 bg-white p-4 text-sm">
      <h2 className="mb-3 font-semibold text-gray-700">Webhook を登録</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="text-gray-700">URL</span>
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/bucketeye" className="mt-1 w-full rounded border border-gray-300 p-2" />
        </label>
        <label className="block">
          <span className="text-gray-700">説明（任意）</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-2" />
        </label>
        <fieldset>
          <legend className="text-gray-700">イベント</legend>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="mr-4 inline-flex items-center gap-1">
              <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(ev)} />
              <code>{ev}</code>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={m.isPending || events.length === 0} className="rounded bg-gray-800 px-3 py-1.5 text-white disabled:opacity-50">
          登録
        </button>
        {m.isError && <p className="text-xs text-red-600">{m.error.message}</p>}
      </form>
      {created && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="font-medium text-amber-900">署名用シークレット（この画面を閉じると二度と表示されません）</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs">{created.secret}</code>
          <p className="mt-1 text-xs text-amber-800">
            配送には <code>X-Bucketeye-Signature: sha256=&lt;HMAC-SHA256(secret, body)&gt;</code> が付きます
          </p>
        </div>
      )}
    </section>
  )
}
