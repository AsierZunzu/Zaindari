import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALE_KEY,
  isSupportedLocale,
  matchLocale,
  resolveInitialLocale,
  setLocale,
  i18n,
} from '../i18n'

/** Stubs what the browser reports as the user's preferred languages. */
function browserLanguages(...tags: string[]) {
  vi.stubGlobal('navigator', {
    languages: tags,
    language: tags[0],
  })
}

describe('matchLocale', () => {
  it('accepts a bare tag and a regional variant alike', () => {
    expect(matchLocale('eu')).toBe('eu')
    expect(matchLocale('es-MX')).toBe('es')
    expect(matchLocale('EN-GB')).toBe('en')
  })

  it('returns null rather than guessing for anything we do not ship', () => {
    expect(matchLocale('de')).toBeNull()
    expect(matchLocale('')).toBeNull()
    expect(matchLocale(null)).toBeNull()
  })
})

describe('resolveInitialLocale', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to English when nothing else says otherwise', () => {
    browserLanguages('de-DE', 'fr')
    expect(resolveInitialLocale()).toBe(DEFAULT_LOCALE)
  })

  it('follows the browser when there is no cached choice', () => {
    browserLanguages('es-ES')
    expect(resolveInitialLocale()).toBe('es')
  })

  it('walks the whole preference list rather than only the first entry', () => {
    // First choice is one we do not ship; the user still gets their second,
    // which beats dropping them into English.
    browserLanguages('de-DE', 'eu-ES', 'en')
    expect(resolveInitialLocale()).toBe('eu')
  })

  it('falls back to navigator.language when languages is unavailable', () => {
    vi.stubGlobal('navigator', { languages: undefined, language: 'eu' })
    expect(resolveInitialLocale()).toBe('eu')
  })

  it('prefers the cached choice over the browser', () => {
    // The cache mirrors the account, so a Basque-speaking user on an
    // English-language phone must not flash English on every reload.
    localStorage.setItem(LOCALE_KEY, 'eu')
    browserLanguages('en-GB')
    expect(resolveInitialLocale()).toBe('eu')
  })

  it('ignores a cached value that is no longer a locale we ship', () => {
    localStorage.setItem(LOCALE_KEY, 'klingon')
    browserLanguages('es')
    expect(resolveInitialLocale()).toBe('es')
  })
})

describe('setLocale', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE)
  })

  it('switches vue-i18n, the cache and <html lang> together', () => {
    setLocale('eu')

    expect(i18n.global.locale.value).toBe('eu')
    expect(localStorage.getItem(LOCALE_KEY)).toBe('eu')
    // <html lang> drives hyphenation, spellcheck and screen-reader voice, so
    // it has to track the switch and not just the initial render.
    expect(document.documentElement.lang).toBe('eu')
  })
})

describe('isSupportedLocale', () => {
  it('rejects regional variants and non-strings, so it is safe to store', () => {
    expect(isSupportedLocale('es')).toBe(true)
    expect(isSupportedLocale('es-ES')).toBe(false)
    expect(isSupportedLocale(7)).toBe(false)
  })
})
