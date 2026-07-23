import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import es from './locales/es.json'
import eu from './locales/eu.json'

export const SUPPORTED_LOCALES = ['en', 'es', 'eu'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Where the pre-login guess is cached. The server is the authority for a
 * signed-in user (`User.locale`); this only answers "what language should the
 * login screen be in?", which has to be decided before any user exists.
 */
export const LOCALE_KEY = 'locale'

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

/** Matches `es-ES` and `es` alike; anything unknown falls back to English. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const base = tag.split('-')[0].toLowerCase()
  return isSupportedLocale(base) ? base : null
}

/**
 * Decides the locale the app boots in, before `getMe()` has said what the
 * signed-in user actually prefers. English is the baseline; the browser is
 * consulted at startup so a first-time visitor lands in their own language
 * without having to find a setting first.
 *
 * Order:
 *   1. The cached choice, if there is one. This is only ever a mirror of the
 *      account's `locale` (see `setLocale`), so honouring it is what stops a
 *      reload flashing English before `getMe()` comes back.
 *   2. `navigator.languages`, in the browser's own order of preference — the
 *      whole list, not just `navigator.language`, so someone whose first choice
 *      we do not ship still gets their second rather than English.
 *   3. English.
 */
export function resolveInitialLocale(): Locale {
  const cached = matchLocale(localStorage.getItem(LOCALE_KEY))
  if (cached) return cached

  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]

  for (const tag of preferred) {
    const match = matchLocale(tag)
    if (match) return match
  }

  return DEFAULT_LOCALE
}

/**
 * Named date formats, defined once so every date in the app is formatted the
 * same way and each locale can diverge where it needs to. Intl does the
 * per-locale work; these only name the shapes we use.
 */
export const DATETIME_FORMATS = {
  short: { day: 'numeric', month: 'short' },
  shortWithYear: { day: 'numeric', month: 'short', year: 'numeric' },
  /** The weekday name on its own, for the calendar's column headers. */
  weekday: { weekday: 'short' },
  weekdayShort: { weekday: 'short', day: 'numeric', month: 'short' },
  weekdayShortWithYear: {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
  monthYear: { month: 'long', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
} as const

export const i18n = createI18n({
  // Composition API mode. Legacy mode is deprecated in v11 and gone in v12,
  // and `globalInjection` is what makes `$t` work in templates without every
  // component importing `useI18n`.
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, es, eu },
  datetimeFormats: {
    en: DATETIME_FORMATS,
    es: DATETIME_FORMATS,
    eu: DATETIME_FORMATS,
  },
})

/**
 * Switches the active locale everywhere it is observable: vue-i18n itself, the
 * `<html lang>` attribute (which drives hyphenation, spellcheck and screen
 * readers), and the cached pre-login guess.
 *
 * Deliberately does *not* call the API — persisting to the account is the
 * caller's job, because this also runs for signed-out users and when adopting
 * the value the server just sent us.
 */
export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_KEY, locale)
  document.documentElement.lang = locale
}

/** The active locale, for code outside a component that needs to read it. */
export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}
