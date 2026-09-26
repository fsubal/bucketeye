import { z } from 'zod'
import { Delivery, WebhookPublic, type WebhookInput } from '@/domains/Webhook/model'
import { request } from '@/utils/http'

export async function listWebhooks(): Promise<WebhookPublic[]> {
  return (await request(z.object({ webhooks: z.array(WebhookPublic) }), '/api/v1/webhooks')).webhooks
}

/** 作成時だけ secret が丸ごと返る（以後は hint のみ） */
export async function createWebhook(input: WebhookInput): Promise<WebhookPublic & { secret: string }> {
  return (await request(z.object({ webhook: WebhookPublic.extend({ secret: z.string() }) }), '/api/v1/webhooks', { method: 'POST', json: input })).webhook
}

export async function updateWebhook(id: string, input: Partial<WebhookInput>): Promise<WebhookPublic> {
  return (await request(z.object({ webhook: WebhookPublic }), `/api/v1/webhooks/${id}`, { method: 'PATCH', json: input })).webhook
}

export async function deleteWebhook(id: string): Promise<void> {
  await request(z.undefined(), `/api/v1/webhooks/${id}`, { method: 'DELETE' })
}

export async function pingWebhook(id: string): Promise<void> {
  await request(z.object({ event: z.unknown() }), `/api/v1/webhooks/${id}/ping`, { method: 'POST' })
}

export async function listDeliveries(id: string): Promise<Delivery[]> {
  return (await request(z.object({ deliveries: z.array(Delivery) }), `/api/v1/webhooks/${id}/deliveries`)).deliveries
}
