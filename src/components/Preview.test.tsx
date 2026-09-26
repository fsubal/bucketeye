// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ReviewedObject } from '@/domains/ReviewedObject/model'
import { Preview } from './Preview'

const object: ReviewedObject = {
  bucket: 'b', key: 'k/cover.png', name: 'cover.png', etag: null, size: 1, content_type: 'image/png', kind: 'image',
  last_modified: null, status: 'pending', status_updated_at: null, reviewer: null, indexed_at: null,
}
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('Preview', () => {
  test('画像は img で出す', () => {
    wrap(<Preview object={object} preview={{ kind: 'image', url: 'https://s3.example/x.png', download_url: 'https://s3.example/x.png?dl' }} />)
    expect(screen.getByAltText('cover.png')).toHaveAttribute('src', 'https://s3.example/x.png')
  })
  test('未対応形式はダウンロード導線を出す', () => {
    wrap(<Preview object={{ ...object, kind: 'other', content_type: 'application/zip' }} preview={{ kind: 'other', download_url: 'https://s3.example/x.zip' }} />)
    expect(screen.getByText('ダウンロードしてレビュー')).toHaveAttribute('href', 'https://s3.example/x.zip')
  })
})
