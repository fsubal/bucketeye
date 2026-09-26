#!/usr/bin/env node
// Webhook の受け口。署名を検証してログに出す。
//   WEBHOOK_SECRET=<登録時に表示された secret> node scripts/webhook-receiver.mjs [port=4000]
//   FAIL=1 を付けると 500 を返して再送を試せる
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 4000)
const secret = process.env.WEBHOOK_SECRET ?? ''
const fail = process.env.FAIL === '1'

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const sig = req.headers['x-bucketeye-signature'] ?? ''
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    const valid = secret && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    console.log(`[${new Date().toISOString()}] ${req.headers['x-bucketeye-event']} delivery=${req.headers['x-bucketeye-delivery']} signature=${valid ? 'valid' : 'INVALID'}`)
    console.log(body)
    res.writeHead(fail ? 500 : 200, { 'Content-Type': 'text/plain' }).end(fail ? 'simulated failure' : 'ok')
  })
}).listen(port, () => console.log(`webhook receiver listening on http://localhost:${port} (${fail ? 'returning 500' : 'returning 200'})`))
