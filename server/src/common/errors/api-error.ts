/**
 * Stable identifiers for the errors a user actually reads.
 *
 * The server does not translate these. It sends a `code` (plus any values the
 * sentence needs) and the client owns the wording, which keeps a single message
 * catalog on the client instead of two that have to be kept in step — and means
 * the user's language, not the request's, decides how the error reads.
 *
 * The English `message` travels alongside as the developer-facing value: it is
 * what shows up in logs, in `curl`, and in the client's fallback when a code is
 * newer than the client bundle offline caches.
 *
 * Every code here must have an `errors.<code>` key in the client catalogs;
 * `client/src/locales/__tests__/locales.test.ts` is what enforces that the
 * three locales agree, and adding a code without a key surfaces as the raw
 * English message rather than a crash.
 */
export const ERROR_CODES = {
  signupDisabled: 'auth.signupDisabled',
  usernameTaken: 'auth.usernameTaken',
  invalidCredentials: 'auth.invalidCredentials',
  sessionExpired: 'auth.sessionExpired',

  plantOwnerOnly: 'plants.ownerOnly',
  plantShareOwnerOnly: 'plants.shareOwnerOnly',
  plantNotFound: 'plants.notFound',
  noImageUploaded: 'plants.noImageUploaded',
  imageNotFound: 'plants.imageNotFound',
  invalidImage: 'plants.invalidImage',
  imageTooLarge: 'plants.imageTooLarge',
  imageForbidden: 'plants.imageForbidden',

  taskNotCompletable: 'tasks.notCompletable',
  taskNotUndoable: 'tasks.notUndoable',
  taskNotFound: 'tasks.notFound',

  invalidNotificationTime: 'schedules.invalidNotificationTime',

  noBundleUploaded: 'data.noBundleUploaded',
  bundleTooLarge: 'data.bundleTooLarge',
  bundleInvalid: 'data.bundleInvalid',
  bundleVersionUnsupported: 'data.bundleVersionUnsupported',
  importFailed: 'data.importFailed',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Values interpolated into the translated sentence, e.g. `{ mb: 10 }`. */
  params?: Record<string, string | number>;
}

/**
 * Builds the response body for a Nest exception. Nest passes an object response
 * through verbatim, so the shape below is exactly what the client receives:
 *
 *   throw new ConflictException(apiError(ERROR_CODES.usernameTaken, 'Username already taken'));
 */
export function apiError(
  code: ErrorCode,
  message: string,
  params?: Record<string, string | number>,
): ApiErrorBody {
  return params ? { code, message, params } : { code, message };
}
