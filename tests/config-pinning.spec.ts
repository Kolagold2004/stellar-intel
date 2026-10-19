// @vitest-environment node
//
// lib/config's validateEnv() only runs when `typeof window === 'undefined'`
// (the browser inlines NEXT_PUBLIC_* at compile time, so validation there
// would always see an empty process.env). The default unit project runs in
// happy-dom, which defines `window`, so these tests need the real node
// environment to actually exercise validation.
import { describe, it, expect, vi, afterEach } from 'vitest';

// #1104 / #1333 — the USDC issuer and Horizon URL used to be checked only for
// *format* (a valid-looking G... key, a valid-looking URL), so a single env
// change could redirect issuer checks and transaction submission on every
// path without failing any check. lib/config now pins both to the one
// correct value for the configured network and fails boot on a mismatch.

const MAINNET_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const TESTNET_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
// Format-valid but not the canonical mainnet issuer.
const WRONG_ISSUER = 'GWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONG';

async function load() {
  vi.resetModules();
  return import('@/lib/config');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CANONICAL_NETWORK_VALUES pinning (#1333)', () => {
  it('imports fine on mainnet with the canonical issuer and Horizon URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', MAINNET_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://horizon.stellar.org');

    const { config, CANONICAL_NETWORK_VALUES } = await load();
    expect(config.usdcIssuer).toBe(MAINNET_ISSUER);
    expect(CANONICAL_NETWORK_VALUES.mainnet?.usdcIssuer).toBe(MAINNET_ISSUER);
  });

  it('throws on mainnet with a wrong (but format-valid) issuer, naming the variable', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', WRONG_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://horizon.stellar.org');

    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_USDC_ISSUER/);
  });

  it('throws on mainnet with a Horizon URL pointed at an unrelated host', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', MAINNET_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://evil.example');

    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_HORIZON_URL/);
  });

  it('throws on mainnet with the right host over plain http', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', MAINNET_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'http://horizon.stellar.org');

    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_HORIZON_URL/);
  });

  it('imports fine on testnet with the canonical testnet issuer and Horizon URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', TESTNET_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://horizon-testnet.stellar.org');

    const { config } = await load();
    expect(config.usdcIssuer).toBe(TESTNET_ISSUER);
    expect(config.stellarNetwork).toBe('testnet');
  });

  it('throws on testnet when given the mainnet issuer', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', MAINNET_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://horizon-testnet.stellar.org');

    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_USDC_ISSUER/);
  });

  it('imports fine on futurenet with any format-valid issuer and Horizon URL (unchecked network)', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'futurenet');
    vi.stubEnv('NEXT_PUBLIC_USDC_ISSUER', WRONG_ISSUER);
    vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', 'https://horizon-futurenet.stellar.org');

    const { config } = await load();
    expect(config.stellarNetwork).toBe('futurenet');
    expect(config.usdcIssuer).toBe(WRONG_ISSUER);
  });
});
