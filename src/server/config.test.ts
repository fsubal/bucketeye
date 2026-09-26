import { describe, expect, test } from 'vitest'
import { buildConfig, parseDurationSeconds } from './config'

describe('config', () => {
  test('S3_BUCKET は必須、prefix は正規化、endpoint 指定時は path-style が既定', () => {
    expect(() => buildConfig({})).toThrow(/S3_BUCKET/)
    const c = buildConfig({ S3_BUCKET: 'b', REVIEW_PREFIX: '/meta', S3_ENDPOINT: 'http://s3:9000' })
    expect(c.s3.reviewPrefix).toBe('meta/')
    expect(c.s3.forcePathStyle).toBe(true)
    expect(c.s3.publicEndpoint).toBe('http://s3:9000')
    expect(c.auth.provider).toBe('developer')
  })

  test('production では AUTH_PROVIDER 必須、developer は明示が必要', () => {
    expect(() => buildConfig({ NODE_ENV: 'production', S3_BUCKET: 'b' })).toThrow(/AUTH_PROVIDER/)
    expect(() => buildConfig({ NODE_ENV: 'production', S3_BUCKET: 'b', AUTH_PROVIDER: 'developer' })).toThrow(/development only/)
    expect(buildConfig({ NODE_ENV: 'production', S3_BUCKET: 'b', AUTH_PROVIDER: 'developer', AUTH_ALLOW_DEVELOPER_IN_PRODUCTION: 'true' }).production).toBe(true)
    expect(() => buildConfig({ S3_BUCKET: 'b', STATUS_STRATEGY: 'metadata' })).toThrow(/invalid configuration/)
  })

  test('期間の表記', () => {
    expect(parseDurationSeconds('10m')).toBe(600)
    expect(parseDurationSeconds('2s')).toBe(2)
    expect(parseDurationSeconds('1h')).toBe(3600)
    expect(parseDurationSeconds('every 5 minutes')).toBe(300)
    expect(() => parseDurationSeconds('soon')).toThrow()
  })
})
