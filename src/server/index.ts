import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDeps } from './deps'
import { mountStatic } from './static'
import { WebhookWorker } from './webhooks/worker'
import { runCli } from './cli'

// `node dist/server.js seed /sample` のようにサブコマンドがあれば CLI として動く
if (process.argv.length > 2) {
  runCli(process.argv.slice(2)).then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    },
  )
} else {
  main()
}

function main() {
  let deps
  try {
    deps = createDeps()
  } catch (e) {
    console.error(`[bucketeye] ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
  const { config } = deps
  const app = createApp(deps)
  const staticMounted = mountStatic(app)

  const worker = new WebhookWorker(deps.db, { intervalSeconds: config.webhookWorkerIntervalSeconds, log: console.log })
  deps.poller.start(config.reindexOnBoot)
  worker.start()

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(
      `[bucketeye] listening on http://${info.address}:${info.port} ` +
        `(auth=${config.auth.provider}, bucket=s3://${config.s3.bucket}/${config.s3.targetPrefix}, status=${config.s3.statusStrategy}, ui=${staticMounted ? 'dist/web' : 'none (run vite dev)'})`,
    )
  })

  const shutdown = () => {
    console.log('[bucketeye] shutting down')
    deps.poller.stop()
    worker.stop()
    server.close(() => {
      deps.db.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
