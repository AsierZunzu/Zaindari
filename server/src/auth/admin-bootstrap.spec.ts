import { describe, it, expect } from 'vitest';
import { grantsAdmin } from './admin-bootstrap.js';

describe('grantsAdmin', () => {
  it('grants admin to the account claiming the bootstrap username', () => {
    expect(grantsAdmin('asier', 'asier')).toBe(true);
  });

  it('does not grant admin to anyone else', () => {
    expect(grantsAdmin('someone-else', 'asier')).toBe(false);
  });

  // The steady state: the variable is unset on most installs, and every account
  // created there must come out non-admin. `AuthService` passes '' when the key
  // is missing, so this is the case that runs in production, not an edge case.
  it('grants admin to nobody when the variable is unset', () => {
    expect(grantsAdmin('asier', '')).toBe(false);
    expect(grantsAdmin('', '')).toBe(false);
  });

  // The OIDC path synthesises a username when the provider returns no
  // preferred_username, and an empty-ish one must not collide with an unset
  // variable into an accidental admin.
  it('does not treat a blank username as a match', () => {
    expect(grantsAdmin('   ', '')).toBe(false);
  });

  // Deployer-controlled configuration, so the match forgives the two ways an
  // .env file routinely differs from what was typed at the signup form.
  it('ignores casing on either side', () => {
    expect(grantsAdmin('asier', 'Asier')).toBe(true);
    expect(grantsAdmin('ASIER', 'asier')).toBe(true);
  });

  it('ignores surrounding whitespace on either side', () => {
    expect(grantsAdmin('asier', 'asier ')).toBe(true);
    expect(grantsAdmin('asier', '  asier  ')).toBe(true);
  });

  // A variable that is only whitespace is an unset one, not a match for the
  // blank usernames the OIDC path can synthesise.
  it('treats a whitespace-only variable as unset', () => {
    expect(grantsAdmin('   ', '   ')).toBe(false);
    expect(grantsAdmin('asier', '   ')).toBe(false);
  });

  // Loose on case and padding, still exact on the name itself.
  it('does not match on a prefix or substring', () => {
    expect(grantsAdmin('asier2', 'asier')).toBe(false);
    expect(grantsAdmin('asi', 'asier')).toBe(false);
  });
});
