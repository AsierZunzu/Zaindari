import { describe, it, expect } from 'vitest';
import {
  CATALOGS,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  localeFromAcceptLanguage,
  isSupportedLocale,
  resolveLocale,
  translate,
} from './messages.js';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('message catalogs', () => {
  it('every locale defines exactly the keys English defines', () => {
    const expected = flatten(CATALOGS[DEFAULT_LOCALE]).sort();

    for (const locale of SUPPORTED_LOCALES) {
      expect(flatten(CATALOGS[locale]).sort(), locale).toEqual(expected);
    }
  });

  it('every message is non-empty', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of flatten(CATALOGS[locale])) {
        expect(translate(locale, key as never), `${locale}:${key}`).not.toBe(
          '',
        );
      }
    }
  });

  it('keeps the {plant} placeholder in every translation of a due task', () => {
    // A translator dropping the placeholder would produce a notification that
    // never names the plant, which is the only useful part of the message.
    for (const locale of SUPPORTED_LOCALES) {
      for (const type of [
        'watering',
        'fertilization',
        'misting',
        'repotting',
      ]) {
        expect(
          translate(locale, `push.taskDue.${type}` as never, {
            plant: 'Monstera',
          }),
          `${locale}:${type}`,
        ).toContain('Monstera');
      }
    }
  });
});

describe('translate', () => {
  it('substitutes named parameters', () => {
    expect(translate('en', 'push.taskDue.watering', { plant: 'Fern' })).toBe(
      'Time to water Fern!',
    );
  });

  it('leaves an unknown placeholder untouched rather than blanking it', () => {
    expect(translate('en', 'push.taskDue.watering', {})).toContain('{plant}');
  });

  it('falls back to English for an unsupported locale', () => {
    expect(translate('de', 'push.taskDue.misting', { plant: 'Fern' })).toBe(
      'Time to mist Fern!',
    );
  });

  it('resolves a regional tag to its base locale', () => {
    expect(
      translate('es-MX', 'push.taskDue.repotting', { plant: 'Fern' }),
    ).toBe(translate('es', 'push.taskDue.repotting', { plant: 'Fern' }));
  });
});

describe('resolveLocale', () => {
  it('accepts supported locales and regional variants', () => {
    expect(resolveLocale('eu')).toBe('eu');
    expect(resolveLocale('es-ES')).toBe('es');
  });

  it('falls back for null, empty and unknown values', () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('klingon')).toBe(DEFAULT_LOCALE);
  });
});

describe('isSupportedLocale', () => {
  it('rejects anything that is not one of the shipped locales', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('es-ES')).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('localeFromAcceptLanguage', () => {
  it('takes the highest-quality supported entry, not merely the first', () => {
    expect(localeFromAcceptLanguage('eu;q=0.7, es;q=0.9')).toBe('es');
  });

  it('treats a missing q-value as q=1', () => {
    expect(localeFromAcceptLanguage('es, eu;q=0.9')).toBe('es');
  });

  it('skips unsupported languages to reach one we ship', () => {
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,eu;q=0.5')).toBe('eu');
  });

  it('ignores entries the client explicitly refused with q=0', () => {
    expect(localeFromAcceptLanguage('es;q=0, eu;q=0.5')).toBe('eu');
  });

  it('falls back when the header is absent or matches nothing', () => {
    expect(localeFromAcceptLanguage(undefined)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.8')).toBe(DEFAULT_LOCALE);
  });
});
