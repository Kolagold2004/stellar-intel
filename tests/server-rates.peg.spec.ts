/**
 * Peg-aware FX rate path (ANC015).
 *
 * Validates that indicativeRate uses getFxRate(corridor.fromPeg, corridor.to)
 * rather than getUsdFxRate, so that same-currency corridors (e.g. brl-brl)
 * produce a 1:1 rate and cross-currency corridors (e.g. usdc-ngn) still apply
 * the correct USD→fiat rate.
 *
 * All network I/O is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Anchor, Corridor, Sep1TomlData } from '@/types';

vi.mock('@/lib/stellar/anchors', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/stellar/anchors')>();
  return { ...actual, getAnchorsByCorridorId: vi.fn(), getCorridorById: vi.fn() };
});
vi.mock('@/lib/stellar/sep1', () => ({ resolveAnchor: vi.fn() }));
vi.mock('@/lib/stellar/sep38', () => ({
  assertSep38Capable: vi.fn(),
  getSep38Price: vi.fn(),
}));
vi.mock('@/lib/stellar/sep24', () => ({ getSep24Info: vi.fn() }));
vi.mock('@/lib/fx/rates', () => ({ getUsdFxRate: vi.fn(), getFxRate: vi.fn() }));

import { fetchCorridorRates } from '@/lib/stellar/server-rates';
import { getAnchorsByCorridorId, getCorridorById } from '@/lib/stellar/anchors';
import { resolveAnchor } from '@/lib/stellar/sep1';
import { assertSep38Capable } from '@/lib/stellar/sep38';
import { getSep24Info } from '@/lib/stellar/sep24';
import { getUsdFxRate, getFxRate } from '@/lib/fx/rates';

// ─── brl-brl corridor fixtures ────────────────────────────────────────────────

const BRL_ISSUER = 'GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP';

const ntokensAnchor: Anchor = {
  id: 'ntokens',
  name: 'nTokens',
  homeDomain: 'ntokens.com',
  corridors: ['brl-brl'],
  assetCode: 'BRL',
  assetIssuer: BRL_ISSUER,
  seps: ['sep6', 'sep24', 'sep31'],
};

const brlCorridorDef: Corridor = {
  id: 'brl-brl',
  from: 'BRL',
  fromIssuer: BRL_ISSUER,
  fromPeg: 'BRL',
  to: 'BRL',
  countryCode: 'BR',
  countryName: 'Brazil',
};

const brlToml = {
  domain: 'ntokens.com',
  TRANSFER_SERVER_SEP0024: 'https://ntokens-box.bpventures.us/sep24',
  TRANSFER_SERVER: null,
  ANCHOR_QUOTE_SERVER: null,
  WEB_AUTH_ENDPOINT: null,
  SIGNING_KEY: null,
  NETWORK_PASSPHRASE: null,
  ORG_URL: null,
  ORG_SUPPORT_EMAIL: null,
  ORG_SUPPORT_URL: null,
  CURRENCIES: [],
  capabilities: { sep10: false, sep24: true, sep38: false, sep12: false, sep6: true, sep31: true },
  seps: ['sep6', 'sep24', 'sep31'],
} as unknown as Sep1TomlData;

// SEP-24 /info with zero fee_fixed and zero fee_percent
const brlSep24Info = {
  withdraw: {
    BRL: {
      enabled: true,
      fee_fixed: 0,
      fee_percent: 0,
    },
  },
} as unknown as Awaited<ReturnType<typeof getSep24Info>>;

// ─── usdc-ngn corridor fixtures (regression: USD-pegged corridors still work) ──

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const usdcNgnAnchor: Anchor = {
  id: 'ngnc',
  name: 'NGNC',
  homeDomain: 'ngnc.online',
  corridors: ['usdc-ngn'],
  assetCode: 'USDC',
  assetIssuer: USDC_ISSUER,
  seps: ['sep24'],
};

const usdcNgnCorridor: Corridor = {
  id: 'usdc-ngn',
  from: 'USDC',
  fromIssuer: USDC_ISSUER,
  fromPeg: 'USD',
  to: 'NGN',
  countryCode: 'NG',
  countryName: 'Nigeria',
};

const usdcNgnToml = {
  domain: 'ngnc.online',
  TRANSFER_SERVER_SEP0024: 'https://ngnc.online/sep24',
  TRANSFER_SERVER: null,
  ANCHOR_QUOTE_SERVER: null,
  WEB_AUTH_ENDPOINT: null,
  SIGNING_KEY: null,
  NETWORK_PASSPHRASE: null,
  ORG_URL: null,
  ORG_SUPPORT_EMAIL: null,
  ORG_SUPPORT_URL: null,
  CURRENCIES: [],
  capabilities: {
    sep10: false,
    sep24: true,
    sep38: false,
    sep12: false,
    sep6: false,
    sep31: false,
  },
  seps: ['sep24'],
} as unknown as Sep1TomlData;

const usdcNgnSep24Info = {
  withdraw: {
    USDC: { enabled: true, fee_fixed: 2, fee_percent: 0 },
  },
} as unknown as Awaited<ReturnType<typeof getSep24Info>>;

// ─── BRL-BRL: same-currency peg-aware test ───────────────────────────────────

describe('fetchCorridorRates — brl-brl same-currency corridor (ANC015)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnchorsByCorridorId).mockReturnValue([ntokensAnchor]);
    vi.mocked(getCorridorById).mockReturnValue(brlCorridorDef);
    vi.mocked(resolveAnchor).mockResolvedValue(brlToml);
    vi.mocked(assertSep38Capable).mockImplementation(() => {
      throw new Error('no SEP-38');
    });
    vi.mocked(getSep24Info).mockResolvedValue(brlSep24Info);
    // getFxRate('BRL', 'BRL') → 1  (same-currency; the real implementation
    // returns 1 without a network call, but here we mock it explicitly)
    vi.mocked(getFxRate).mockResolvedValue(1);
  });

  it('returns a rate for nTokens on the brl-brl corridor', async () => {
    const result = await fetchCorridorRates('brl-brl', '100');

    expect(result.rates).toHaveLength(1);
    expect(result.rates[0]?.anchorId).toBe('ntokens');
  });

  it('totalReceived equals sellAmount when fee is 0 and peg BRL→BRL = 1', async () => {
    const result = await fetchCorridorRates('brl-brl', '100');

    // sellAmount=100, fee_fixed=0, fee_percent=0 → net=100; 100 × 1 = 100
    expect(result.rates[0]?.totalReceived).toBeCloseTo(100);
  });

  it('exchangeRate is 1 for a zero-fee same-currency corridor', async () => {
    const result = await fetchCorridorRates('brl-brl', '100');

    expect(result.rates[0]?.exchangeRate).toBeCloseTo(1);
  });

  it('sources the rate from the SEP-24 fee path', async () => {
    const result = await fetchCorridorRates('brl-brl', '100');

    expect(result.rates[0]?.source).toBe('sep24-fee');
  });

  it('does not call getUsdFxRate for a same-currency corridor', async () => {
    await fetchCorridorRates('brl-brl', '100');

    expect(vi.mocked(getUsdFxRate)).not.toHaveBeenCalled();
  });

  it('calls getFxRate with (BRL, BRL)', async () => {
    await fetchCorridorRates('brl-brl', '100');

    expect(vi.mocked(getFxRate)).toHaveBeenCalledWith('BRL', 'BRL');
  });
});

// ─── USDC-NGN: USD-pegged corridor still applies correct FX rate ──────────────

describe('fetchCorridorRates — usdc-ngn USD-pegged corridor still works (ANC015 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnchorsByCorridorId).mockReturnValue([usdcNgnAnchor]);
    vi.mocked(getCorridorById).mockReturnValue(usdcNgnCorridor);
    vi.mocked(resolveAnchor).mockResolvedValue(usdcNgnToml);
    vi.mocked(assertSep38Capable).mockImplementation(() => {
      throw new Error('no SEP-38');
    });
    vi.mocked(getSep24Info).mockResolvedValue(usdcNgnSep24Info);
    // getFxRate('USD', 'NGN') → 1600
    vi.mocked(getFxRate).mockResolvedValue(1600);
  });

  it('computes totalReceived using the USD→NGN FX rate', async () => {
    const result = await fetchCorridorRates('usdc-ngn', '100');

    // sellAmount=100, fee_fixed=2 → net=98; 98 × 1600 = 156800
    expect(result.rates[0]?.totalReceived).toBeCloseTo(156800);
  });

  it('calls getFxRate with (USD, NGN)', async () => {
    await fetchCorridorRates('usdc-ngn', '100');

    expect(vi.mocked(getFxRate)).toHaveBeenCalledWith('USD', 'NGN');
  });

  it('does not call getUsdFxRate directly', async () => {
    await fetchCorridorRates('usdc-ngn', '100');

    expect(vi.mocked(getUsdFxRate)).not.toHaveBeenCalled();
  });
});
