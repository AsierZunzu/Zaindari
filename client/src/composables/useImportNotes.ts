import { useI18n } from 'vue-i18n'
import type { ImportNote } from '../api/data'

/**
 * Renders the descriptors an import returns.
 *
 * The server names what it could not carry over and the client words it, so
 * these read in the user's language rather than the request's — the same split
 * that error codes use. Kept out of the component for the same reason
 * `useTaskLabels` is: plural forms belong in one place.
 *
 * The counted messages are pluralised, which is not decoration. Basque and
 * Spanish do not agree with English about when a noun changes shape, so
 * `"photo" + (n === 1 ? '' : 's')` cannot be translated at all.
 */
export function useImportNotes() {
  const { t } = useI18n()

  function importNote(note: ImportNote): string {
    switch (note.kind) {
      case 'photosMissing':
        return t(
          'settings.data.notes.photosMissing',
          { plant: note.plant, count: note.count },
          note.count,
        )
      case 'photosUnreadable':
        return t(
          'settings.data.notes.photosUnreadable',
          { plant: note.plant, count: note.count },
          note.count,
        )
      case 'localeUnavailable':
        return t('settings.data.notes.localeUnavailable', { locale: note.locale })
    }
  }

  return { importNote }
}
