// @vitest-environment node
//
// Keypair.random() relies on Node's crypto for secure entropy, which
// happy-dom (the default unit-project environment) does not provide, and
// lib/config's validateEnv() (imported transitively via the route) only runs
// when `typeof window === 'undefined'`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadRoute() {
  vi.resetModules();
  return import('@/app/.well-known/stellar.toml/route');
}

describe('GET /.well-known/stellar.toml (#1326)', () => {
  it('includes SIGNING_KEY, the network passphrase, and org documentation when the secret is configured', async () => {
    const kp = Keypair.random();
    vi.stubEnv('CLIENT_DOMAIN_SIGNING_SECRET', kp.secret());

    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.text();

    expect(body).toContain(`SIGNING_KEY = "${kp.publicKey()}"`);
    expect(body).toContain('NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015"');
    expect(body).toContain('[DOCUMENTATION]');
    expect(body).toContain('ORG_NAME = "Stellar Intel"');

    // The secret itself must never appear in the response.
    expect(body).not.toContain(kp.secret());
  });

  it('sets CORS and text/plain headers required by SEP-1', async () => {
    const kp = Keypair.random();
    vi.stubEnv('CLIENT_DOMAIN_SIGNING_SECRET', kp.secret());

    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');
  });

  it('omits SIGNING_KEY and still returns 200 when the secret env var is unset', async () => {
    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('SIGNING_KEY');
    expect(body).toContain('NETWORK_PASSPHRASE');
  });

  it('treats an invalid secret the same as unset', async () => {
    vi.stubEnv('CLIENT_DOMAIN_SIGNING_SECRET', 'not-a-valid-secret-key');

    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('SIGNING_KEY');
  });
});
