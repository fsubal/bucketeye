import { createHash } from 'node:crypto'

/** レビュー対象のキーごとにサイドカーを置く prefix。キーをそのまま使うと長さや文字の問題があるので SHA-256 で畳む（Rails 版と同じ） */
export function sidecarPrefix(reviewPrefix: string, key: string): string {
  return `${reviewPrefix}objects/${createHash('sha256').update(key).digest('hex')}/`
}

export function commentsPrefix(reviewPrefix: string, key: string): string {
  return `${sidecarPrefix(reviewPrefix, key)}comments/`
}

export function statusSidecarKey(reviewPrefix: string, key: string): string {
  return `${sidecarPrefix(reviewPrefix, key)}status.json`
}

export function webhooksPrefix(reviewPrefix: string): string {
  return `${reviewPrefix}webhooks/`
}

export function webhookKey(reviewPrefix: string, id: string): string {
  return `${webhooksPrefix(reviewPrefix)}${id}.json`
}
