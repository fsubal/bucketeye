import { describe, expect, test } from 'vitest'
import { breadcrumbsOf, kindOf, nameOf, normalizePrefix, parentPrefixOf } from './model'

describe('ReviewedObject', () => {
  test('kindOf は content_type から大分類を決める', () => {
    expect(kindOf('image/png')).toBe('image')
    expect(kindOf('video/mp4')).toBe('video')
    expect(kindOf('application/pdf')).toBe('pdf')
    expect(kindOf('text/plain; charset=utf-8')).toBe('text')
    expect(kindOf('application/json')).toBe('text')
    expect(kindOf('application/zip')).toBe('other')
    expect(kindOf(null)).toBe('other')
  })

  test('prefix / key のヘルパー', () => {
    expect(nameOf('a/b/c.png')).toBe('c.png')
    expect(parentPrefixOf('a/b/c.png')).toBe('a/b/')
    expect(parentPrefixOf('c.png')).toBe('')
    expect(breadcrumbsOf('a/b/')).toEqual([
      { label: 'a', prefix: 'a/' },
      { label: 'b', prefix: 'a/b/' },
    ])
    expect(normalizePrefix('/meta')).toBe('meta/')
    expect(normalizePrefix('')).toBe('')
  })
})
