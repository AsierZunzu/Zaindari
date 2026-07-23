/**
 * Server-side message catalog.
 *
 * Deliberately tiny and dependency-free: the only text the server renders in a
 * user's language is the push notification body, because that is the one string
 * the client never sees before the user does. API errors carry a stable `code`
 * instead (see the exceptions across the modules) and are worded by the client,
 * so they never need to be translated here.
 *
 * Anything added here must be added to every locale — `messages.spec.ts`
 * enforces that, since a missing key silently degrades to English at runtime.
 */

export const SUPPORTED_LOCALES = ['en', 'es', 'eu'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

interface Catalog {
  push: {
    title: string;
    /**
     * One whole sentence per task type rather than "Time to " + verb + plant.
     * Basque puts the object before the verb ("{plant} ureztatzeko garaia da"),
     * so a sentence assembled from fragments cannot be translated at all.
     */
    taskDue: {
      watering: string;
      fertilization: string;
      misting: string;
      repotting: string;
    };
  };
}

const en: Catalog = {
  push: {
    title: 'Zaindari',
    taskDue: {
      watering: 'Time to water {plant}!',
      fertilization: 'Time to fertilize {plant}!',
      misting: 'Time to mist {plant}!',
      repotting: 'Time to repot {plant}!',
    },
  },
};

const es: Catalog = {
  push: {
    title: 'Zaindari',
    taskDue: {
      watering: '¡Toca regar {plant}!',
      fertilization: '¡Toca abonar {plant}!',
      misting: '¡Toca pulverizar {plant}!',
      repotting: '¡Toca trasplantar {plant}!',
    },
  },
};

const eu: Catalog = {
  push: {
    title: 'Zaindari',
    taskDue: {
      watering: '{plant} ureztatzeko garaia da!',
      fertilization: '{plant} ongarritzeko garaia da!',
      misting: '{plant} lainoztatzeko garaia da!',
      repotting: '{plant} loreontziz aldatzeko garaia da!',
    },
  },
};

export const CATALOGS: Record<Locale, Catalog> = { en, es, eu };

/** Dotted paths into the catalog, so a typo in a key is a compile error. */
type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

export type CatalogKey = MessageKey<Catalog>;

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Best-effort match of a locale tag against what we actually ship: `es-ES` and
 * `es` both resolve to `es`. Anything unrecognised falls back rather than
 * throwing — a stored locale is user input and a header is arbitrary.
 */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const base = value.split('-')[0].toLowerCase();
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

/**
 * Picks the best supported locale out of an `Accept-Language` header, honouring
 * the q-values so `eu;q=0.9, es;q=1.0` does not just take the first entry.
 */
export function localeFromAcceptLanguage(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0].toLowerCase();
    if (isSupportedLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

/**
 * Looks up `key` in `locale`, falling back to English for a key the locale is
 * missing, and finally to the key itself so a bad lookup is visible rather than
 * an empty notification.
 */
export function translate(
  locale: string | null | undefined,
  key: CatalogKey,
  params: Record<string, string> = {},
): string {
  const resolved = resolveLocale(locale);
  const message =
    lookup(CATALOGS[resolved], key) ?? lookup(CATALOGS[DEFAULT_LOCALE], key);

  if (message === undefined) return key;

  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? params[name] : match,
  );
}

function lookup(catalog: Catalog, key: string): string | undefined {
  let node: unknown = catalog;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}
