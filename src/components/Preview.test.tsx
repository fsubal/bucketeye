// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ReviewedObject } from '@/domains/ReviewedObject/model'
import { Preview } from './Preview'

const object: ReviewedObject = {
  bucket: 'b', key: 'k/cover.png', name: 'cover.png', etag: null, size: 1, contentType: 'image/png', kind: 'image',
  lastModified: null, status: 'pending', statusUpdatedAt: null, reviewer: null, indexedAt: null,
}
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('Preview', () => {
  test('画像は img で出す', () => {
    wrap(<Preview object={object} preview={{ kind: 'image', url: 'https://s3.example/x.png', downloadUrl: 'https://s3.example/x.png?dl' }} />)
    expect(screen.getByAltText('cover.png')).toHaveAttribute('src', 'https://s3.example/x.png')
  })
  test('未対応形式はダウンロード導線を出す', () => {
    wrap(<Preview object={{ ...object, kind: 'other', contentType: 'application/zip' }} preview={{ kind: 'other', downloadUrl: 'https://s3.example/x.zip' }} />)
    expect(screen.getByText('ダウンロードしてレビュー')).toHaveAttribute('href', 'https://s3.example/x.zip')
  })
})
