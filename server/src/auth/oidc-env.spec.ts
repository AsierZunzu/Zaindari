import { describe, it, expect } from 'vitest';
import { ENV_OIDC_CONFIG_ID, resolveEnvOidcConfig } from './oidc-env.js';

const full = {
  name: 'Authentik',
  issuerUrl: 'https://auth.example.com/application/o/zaindari/',
  clientId: 'zaindari',
  clientSecret: 's3cret',
};

describe('resolveEnvOidcConfig', () => {
  it('returns null when nothing is set, leaving the admin panel in charge', () => {
    expect(resolveEnvOidcConfig({})).toBeNull();
  });

  it('treats blank values as unset, as compose passes them', () => {
    expect(
      resolveEnvOidcConfig({
        name: '',
        issuerUrl: '',
        clientId: '  ',
        clientSecret: '',
      }),
    ).toBeNull();
  });

  it('builds an enabled config from a full set', () => {
    expect(resolveEnvOidcConfig(full)).toMatchObject({
      id: ENV_OIDC_CONFIG_ID,
      name: 'Authentik',
      issuerUrl: full.issuerUrl,
      clientId: 'zaindari',
      clientSecret: 's3cret',
      enabled: true,
    });
  });

  it('keeps a stable updatedAt so discovery stays cached', () => {
    expect(resolveEnvOidcConfig(full)!.updatedAt.getTime()).toBe(
      resolveEnvOidcConfig(full)!.updatedAt.getTime(),
    );
  });

  it('defaults the name shown on the login button', () => {
    expect(resolveEnvOidcConfig({ ...full, name: undefined })!.name).toBe(
      'SSO',
    );
  });

  it('refuses a partial set and names what is missing', () => {
    expect(() =>
      resolveEnvOidcConfig({ issuerUrl: full.issuerUrl, clientId: 'z' }),
    ).toThrow(/ZAINDARI_OIDC_CLIENT_SECRET is missing/);
    expect(() => resolveEnvOidcConfig({ clientSecret: 'x' })).toThrow(
      /ZAINDARI_OIDC_ISSUER_URL, ZAINDARI_OIDC_CLIENT_ID are missing/,
    );
  });

  it('refuses an issuer that is not an http(s) URL', () => {
    expect(() =>
      resolveEnvOidcConfig({ ...full, issuerUrl: 'auth.example.com' }),
    ).toThrow(/not a URL/);
    expect(() =>
      resolveEnvOidcConfig({ ...full, issuerUrl: 'ftp://auth.example.com' }),
    ).toThrow(/http\(s\)/);
  });
});
