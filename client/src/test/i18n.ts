import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import { DATETIME_FORMATS } from '../i18n'

/**
 * A fresh i18n instance per mount, loaded with the real English catalog.
 *
 * Real messages rather than stubs: an assertion like `toContain('No plants
 * yet')` should keep testing what the user sees, and it doubles as a check that
 * the key exists at all — a missing key would render the key path and fail the
 * assertion. Fresh per call so a test that switches locale cannot leak into the
 * next one.
 */
export function createTestI18n() {
  return createI18n({
    legacy: false,
    globalInjection: true,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en },
    // The same formats the app ships, so a test that renders a date exercises
    // the real format rather than vue-i18n's fallback.
    datetimeFormats: { en: DATETIME_FORMATS },
  })
}

/** Spread into `mount(..., { global: testGlobal() })`. */
export function testGlobal(): { plugins: unknown[] } {
  return { plugins: [createTestI18n()] }
}
