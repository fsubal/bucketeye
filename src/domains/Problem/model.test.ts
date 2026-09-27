import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { jsonPointer, PROBLEM_DOCS_URL, PROBLEM_TYPES, problemTypeUri } from './model'

describe('Problem', () => {
  test('type URI は docs/problems.md の見出しを指し、見出しが実在する', () => {
    const doc = readFileSync(new URL('../../../docs/problems.md', import.meta.url), 'utf8')
    for (const name of Object.keys(PROBLEM_TYPES) as Array<keyof typeof PROBLEM_TYPES>) {
      const t = PROBLEM_TYPES[name]
      expect(problemTypeUri(name)).toBe(`${PROBLEM_DOCS_URL}#${t.slug}`)
      expect(doc, t.slug).toContain(`\n## ${t.slug}\n`)
      expect(doc, t.slug).toContain(`| title | ${t.title} |`)
      expect(doc, t.slug).toContain(`| status | ${t.status} |`)
    }
  })

  test('jsonPointer は RFC 6901 の URI フラグメント表現', () => {
    expect(jsonPointer([])).toBe('#')
    expect(jsonPointer(['body'])).toBe('#/body')
    expect(jsonPointer(['events', 0])).toBe('#/events/0')
    expect(jsonPointer(['a/b', 'c~d', 'e f'])).toBe('#/a~1b/c~0d/e%20f')
  })
})
