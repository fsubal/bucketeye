import { beforeEach, describe, expect, test } from 'vitest'
import { runIndex } from '../indexer/indexer'
import { createTestDeps, json, signIn, type TestDeps } from '../../../test/helpers'

let t: TestDeps
let auth: Record<string, string>

beforeEach(async () => {
  t = createTestDeps()
  t.s3.put('submissions/2026/cover.png', 'PNG', { contentType: 'image/png' })
  t.s3.put('submissions/2026/body.pdf', 'PDF', { contentType: 'application/pdf' })
  t.s3.put('submissions/notes.txt', 'some notes', { contentType: 'text/plain' })
  t.s3.put('other/secret.txt', 'x', { contentType: 'text/plain' })
  t.s3.put('.review/objects/zzz/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV.json', '{}', { contentType: 'application/json' })
  await runIndex(t)
  auth = await signIn(t.app)
})

describe('認証', () => {
  test('未ログインは 401 problem+json で login_path を返す', async () => {
    const res = await t.app.request('/api/v1/objects')
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json() as any).toMatchObject({ title: 'unauthenticated', status: 401, login_path: '/dev/login' })
  })

  test('Bearer トークンでも通る。違うトークンは 401', async () => {
    expect((await t.app.request('/api/v1/objects', { headers: { Authorization: 'Bearer test-api-token' } })).status).toBe(200)
    expect((await t.app.request('/api/v1/objects', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401)
  })

  test('/me はプロバイダ情報を返す', async () => {
    const res = await t.app.request('/api/v1/me', { headers: auth })
    expect(await res.json() as any).toMatchObject({ identity: { email: 'reviewer@example.com', role: 'reviewer' }, provider: { provider: 'developer' } })
  })
})

describe('一覧', () => {
  test('フォルダとファイルを分けて出し、ステータスで絞ると平らになる', async () => {
    let body = await (await t.app.request('/api/v1/objects', { headers: auth })).json() as any
    expect(body.folders).toEqual(['2026/'])
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual(['submissions/notes.txt'])
    expect(body.counts).toEqual({ pending: 3 })
    expect(body.indexed).toBe(true)

    body = await (await t.app.request('/api/v1/objects?prefix=2026/', { headers: auth })).json() as any
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual(['submissions/2026/body.pdf', 'submissions/2026/cover.png'])

    await t.statusStore.write('submissions/2026/cover.png', 'approved', 'x@example.com')
    await runIndex(t)
    body = await (await t.app.request('/api/v1/objects?status=approved', { headers: auth })).json() as any
    expect(body.objects.map((o: { key: string }) => o.key)).toEqual(['submissions/2026/cover.png'])
    expect(body.folders).toEqual([])
    expect(body.counts.approved).toBe(1)
    expect(body.pagination).toEqual({ page: 1, per: 100, total: 1 })
  })

  test('不正なクエリは 400', async () => {
    expect((await t.app.request('/api/v1/objects?status=bogus', { headers: auth })).status).toBe(400)
  })
})

describe('詳細', () => {
  test('presigned URL とコメントを返し、対象外のキーは 404', async () => {
    const res = await t.app.request('/api/v1/objects/submissions/2026/cover.png', { headers: auth })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.object).toMatchObject({ key: 'submissions/2026/cover.png', kind: 'image', status: 'pending' })
    expect(body.preview.url).toMatch(/fake\.example\/test-bucket\/submissions\/2026\/cover\.png/)
    expect(body.comments).toEqual([])

    const text = await t.app.request('/api/v1/texts/submissions/notes.txt', { headers: auth })
    expect(await text.text()).toBe('some notes')

    for (const k of ['other/secret.txt', '.review/objects/zzz/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV.json', 'submissions/missing.png']) {
      expect((await t.app.request(`/api/v1/objects/${k}`, { headers: auth })).status, k).toBe(404)
    }
  })
})

describe('コメント', () => {
  test('S3 に W3C Annotation を書いてから SQLite に写し、イベントを積む', async () => {
    await t.app.request('/api/v1/webhooks', { method: 'POST', ...json({ url: 'https://hook.example/x', events: ['comment.created'] }, await signIn(t.app, 'admin@example.com')) })
    const res = await t.app.request('/api/v1/comments/submissions/2026/cover.png', { method: 'POST', ...json({ body: '  needs a bleed margin  ' }, auth) })
    expect(res.status).toBe(201)
    expect((await res.json() as any).comment).toMatchObject({ author_email: 'reviewer@example.com', body: 'needs a bleed margin', selector: null })

    const annotations = await t.commentStore.list('submissions/2026/cover.png')
    expect(annotations.map((a) => a.body.value)).toEqual(['needs a bleed margin'])
    expect(t.s3.keysIn('test-bucket').filter((k) => k.includes('/comments/'))).toHaveLength(2)

    const show = await (await t.app.request('/api/v1/objects/submissions/2026/cover.png', { headers: auth })).json() as any
    expect(show.comments.map((c: { body: string }) => c.body)).toEqual(['needs a bleed margin'])

    const due = t.db.prepare('SELECT event_type FROM webhook_deliveries').all()
    expect(due).toEqual([{ event_type: 'comment.created' }])
  })

  test('空のコメントは 422', async () => {
    const res = await t.app.request('/api/v1/comments/submissions/2026/cover.png', { method: 'POST', ...json({ body: '   ' }, auth) })
    expect(res.status).toBe(422)
    expect(await res.json() as any).toMatchObject({ title: 'invalid_comment' })
  })
})

describe('ステータス', () => {
  test('S3 のタグに書き戻し、変化したときだけイベントを積む', async () => {
    await signIn(t.app, 'alice@example.com').then(async (h) => {
      const res = await t.app.request('/api/v1/statuses/submissions/2026/body.pdf', { method: 'PUT', ...json({ status: 'changes_requested' }, h) })
      expect(res.status).toBe(200)
      expect((await res.json() as any).object).toMatchObject({ status: 'changes_requested', reviewer: 'alice@example.com' })
    })
    expect(await t.s3.getTags('submissions/2026/body.pdf')).toMatchObject({ 'review-status': 'changes_requested', 'review-reviewer': 'alice@example.com' })
    expect(t.db.prepare("SELECT status FROM objects WHERE key = 'submissions/2026/body.pdf'").get()).toEqual({ status: 'changes_requested' })

    const bad = await t.app.request('/api/v1/statuses/submissions/2026/body.pdf', { method: 'PUT', ...json({ status: 'bogus' }, auth) })
    expect(bad.status).toBe(422)
  })

  test('sidecar 戦略ではタグを触らず status.json に書く', async () => {
    const s = createTestDeps({ STATUS_STRATEGY: 'sidecar' })
    s.s3.put('submissions/a.png', 'PNG', { contentType: 'image/png' })
    const h = await signIn(s.app)
    await s.app.request('/api/v1/statuses/submissions/a.png', { method: 'PUT', ...json({ status: 'rejected' }, h) })
    expect(await s.s3.getTags('submissions/a.png')).toEqual({})
    const sidecar = s.s3.keysIn('test-bucket').find((k) => k.endsWith('/status.json'))!
    expect(await s.s3.getJson(sidecar)).toMatchObject({ status: 'rejected', source: 's3://test-bucket/submissions/a.png' })
    expect((await s.statusStore.read('submissions/a.png'))?.status).toBe('rejected')
  })
})

describe('admin', () => {
  test('再索引と Webhook 管理は admin だけ', async () => {
    expect((await t.app.request('/api/v1/admin/reindex', { method: 'POST', headers: auth })).status).toBe(403)
    expect((await t.app.request('/api/v1/webhooks', { headers: auth })).status).toBe(403)
    const admin = await signIn(t.app, 'admin@example.com')
    const res = await t.app.request('/api/v1/admin/reindex', { method: 'POST', headers: admin })
    expect(res.status).toBe(202)
    await t.poller.runNow()
    const runs = await (await t.app.request('/api/v1/admin/index-runs', { headers: admin })).json() as any
    expect(runs.runs[0]).toMatchObject({ objects: 3, error: null })
  })
})
