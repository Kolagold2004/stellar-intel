// ─── Reference FX rates (USD → fiat) ─────────────────────────────────────────
//
// Free, key-less reference rates from open.er-api.com. Used only for *indicative*
// off-ramp estimates: the firm rate a user receives is always confirmed by the
// anchor at execution time. USDC is treated as 1:1 with USD for this estimate.

import { fetchWithTimeout } from '@/lib/stellar/http';

interface FxCacheEntry {
  rates: Record<string, number>;
  expiresAt: number;
}

const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 10 * 60 * 1000; // reference rates move slowly; 10 min is plenty
const REQUEST_TIMEOUT_MS = 6_000;

let cache: FxCacheEntry | null = null;

/** Clears the in-memory FX cache. Exposed for tests only. */
export function _clearFxCache(): void {
  cache = null;
}

async function loadRates(): Promise<Record<string, number>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rates;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(FX_ENDPOINT, REQUEST_TIMEOUT_MS);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`FX rate request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`FX rate provider returned HTTP ${res.status}`);
  }

  const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (body.result !== 'success' || !body.rates) {
    throw new Error('FX rate provider returned an unexpected payload');
  }

  cache = { rates: body.rates, expiresAt: Date.now() + TTL_MS };
  return body.rates;
}

/**
 * Returns the live reference rate for 1 USD in `currencyCode` (ISO 4217, e.g.
 * "NGN"). Throws when the currency is not quoted by the provider.
 */
export async function getUsdFxRate(currencyCode: string): Promise<number> {
  const rates = await loadRates();
  const rate = rates[currencyCode.toUpperCase()];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No reference FX rate available for USD→${currencyCode}`);
  }
  return rate;
}

/**
 * Returns the live reference rate for 1 unit of `pegCode` in `fiatCode`
 * (both ISO 4217, e.g. `getFxRate('USD', 'NGN')` → ~1600).
 *
 * When `pegCode === fiatCode` (e.g. BRL-pegged asset paying out in BRL)
 * the rate is exactly 1 — no network request is made. This keeps the
 * helper a one-line swap target for the Q38018 `referenceMidPrice` follow-up.
 *
 * Throws when the currency pair is not quoted by the provider.
 */
export async function getFxRate(pegCode: string, fiatCode: string): Promise<number> {
  const peg = pegCode.toUpperCase();
  const fiat = fiatCode.toUpperCase();

  // Same-currency corridors (e.g. brl-brl): the peg token is already
  // denominated in the payout currency — no conversion needed.
  if (peg === fiat) return 1;

  // Cross-currency corridors (e.g. usd→ngn): load the USD-based rate table
  // and cross via USD as the base. The provider only publishes USD-base pairs,
  // so peg→fiat = (USD→fiat) / (USD→peg). For the common USD-peg case
  // (USD→peg = 1) this simplifies back to the existing getUsdFxRate path.
  const rates = await loadRates();

  const fiatRate = rates[fiat];
  if (typeof fiatRate !== 'number' || !Number.isFinite(fiatRate) || fiatRate <= 0) {
    throw new Error(`No reference FX rate available for ${peg}→${fiat}`);
  }

  if (peg === 'USD') return fiatRate;

  const pegRate = rates[peg];
  if (typeof pegRate !== 'number' || !Number.isFinite(pegRate) || pegRate <= 0) {
    throw new Error(`No reference FX rate available for USD→${peg} (needed to cross ${peg}→${fiat})`);
  }

  return fiatRate / pegRate;
}
