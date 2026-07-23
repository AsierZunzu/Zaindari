import { describe, it, expect } from 'vitest'
import en from '../en.json'
import es from '../es.json'
import eu from '../eu.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUPPORTED_LOCALES } from '../../i18n'

const catalogs: Record<string, unknown> = { en, es, eu }

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  )
}

function lookup(catalog: unknown, key: string): string | undefined {
  let node: unknown = catalog
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' ? node : undefined
}

/** `{name}`, `{count}`, … in a message. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe('locale catalogs', () => {
  const englishKeys = flatten(en).sort()

  it('ships a catalog for every supported locale', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it.each(Object.keys(catalogs))(
    '%s defines exactly the keys English defines',
    (locale) => {
      // Both directions matter: a missing key silently falls back to English,
      // and an extra one is dead weight that survives a key being renamed.
      expect(flatten(catalogs[locale]).sort()).toEqual(englishKeys)
    },
  )

  it.each(Object.keys(catalogs))('%s has no empty messages', (locale) => {
    for (const key of englishKeys) {
      expect(lookup(catalogs[locale], key), key).not.toBe('')
    }
  })

  it.each(Object.keys(catalogs))(
    '%s interpolates the same values English does',
    (locale) => {
      // A translation that drops `{name}` or `{mb}` renders a sentence with a
      // hole in it — worse than an untranslated one, and invisible until a user
      // on that locale hits it.
      for (const key of englishKeys) {
        const expected = placeholders(lookup(en, key)!)
        expect(placeholders(lookup(catalogs[locale], key)!), key).toEqual(expected)
      }
    },
  )

  it.each(Object.keys(catalogs))(
    '%s keeps the same number of plural forms as English',
    (locale) => {
      for (const key of englishKeys) {
        const expected = lookup(en, key)!.split('|').length
        expect(lookup(catalogs[locale], key)!.split('|').length, key).toBe(expected)
      }
    },
  )

  it('words every error code the server can send', () => {
    // The server sends a code and trusts the client to word it. A code with no
    // `errors.*` key falls back to the English message from the API, which is
    // the one failure mode this whole design exists to avoid.
    //
    // Read as text, not imported: client and server are independent npm
    // projects with no shared package, so importing across the boundary would
    // put server sources in the client's build graph. Scraping the file keeps
    // one source of truth without creating that dependency.
    for (const code of serverErrorCodes()) {
      expect(lookup(en, `errors.${code}`), code).toBeTypeOf('string')
    }
  })
})

/**
 * The values of `ERROR_CODES` in `server/src/common/errors/api-error.ts`.
 * Returns an empty list — skipping the check rather than failing it — when the
 * server tree is not checked out beside the client.
 */
function serverErrorCodes(): string[] {
  // Relative to the vitest root, which is the client project directory.
  const path = resolve(process.cwd(), '../server/src/common/errors/api-error.ts')

  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    return []
  }

  const block = source.match(/export const ERROR_CODES = \{([\s\S]*?)\} as const/)
  if (!block) throw new Error(`Could not find ERROR_CODES in ${path}`)

  return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1])
}
