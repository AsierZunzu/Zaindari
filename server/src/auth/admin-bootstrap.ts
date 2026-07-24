/**
 * Who gets admin rights on a fresh install.
 *
 * Admin is otherwise a closed loop: `AdminGuard` rejects everyone without
 * `isAdmin`, and the only endpoint that can set the flag is itself behind that
 * guard. A brand-new database therefore has no admin and no way to appoint one,
 * so `ZAINDARI_ADMIN_USERNAME` names the account that is granted it at creation
 * time — the deployer proves ownership by controlling the environment rather
 * than by winning a race to register first.
 *
 * Both account creators consult this: local signup (`AuthService.register`) and
 * first OIDC login (`OidcService.findOrCreateUser`). An OIDC-only install would
 * otherwise stay locked out, since it never touches the signup path.
 *
 * This deliberately does *not* run on every login. The env var appoints the
 * first admin; after that the admin panel is the authority, so demoting the
 * bootstrap account there sticks instead of being undone on its next sign-in.
 */

/**
 * Whether an account claiming `username` should be created as an admin.
 *
 * The comparison is trimmed and case-insensitive, which is looser than the
 * case-sensitive `findByUsername` lookup elsewhere. That asymmetry is
 * deliberate: this side of the comparison is deployer-controlled configuration
 * rather than user input, and the two ways to get it wrong are not symmetric.
 * Being forgiving risks nothing — the deployer already owns the environment,
 * so `Asier` and `asier` are the same person by construction. Being strict
 * fails silently, leaving a locked-out admin staring at a correct-looking .env
 * file with a trailing space in it, inside a container.
 *
 * An empty variable is the steady state on nearly every install and must match
 * nobody: the OIDC path can synthesise blank-ish usernames, so a bare equality
 * check here would make every OIDC signup on a default install an admin.
 */
export function grantsAdmin(
  username: string,
  bootstrapUsername: string,
): boolean {
  const configured = bootstrapUsername.trim().toLowerCase();
  if (configured === '') return false;

  return username.trim().toLowerCase() === configured;
}
