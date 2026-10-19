import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSoroswapHop } from '@/lib/router/connectors/swap-soroswap';
import { getSoroswapQuote, SoroswapApiError } from '@/lib/stellar/soroswap';
import type { HopStep } from '@/types';
import {
  fixtureResponse,
  listSoroswapFixtures,
  loadSoroswapFixture,
} from './fixtures/soroswap/load';

// Replays real api.soroswap.finance responses recorded in
// tests/fixtures/soroswap/ (issue #1084). No test here touches the network.

const ACCOUNT = 'GA4TDFETT3TLR6EGQPP5LXBMYJGYKQ2ZYO2OJUOZ2SAMYNFHCL2PBW2U';

type Call = { url: string; body: Record<string, unknown> };

function stubFetch(...fixtures: ReturnType<typeof loadSoroswapFixture>[]) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opts: RequestInit) => {
      calls.push({ url, body: JSON.parse(opts.body as string) });
      const f = fixtures[Math.min(i++, fixtures.length - 1)]!;
      return fixtureResponse(f);
    })
  );
  return calls;
}

beforeEach(() => {
  process.env.SOROSWAP_API_KEY = 'sk_test_key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SOROSWAP_API_KEY;
});

describe('recorded fixtures: hygiene', () => {
  const names = listSoroswapFixtures();

  it('has at least one success and one error fixture', () => {
    const statuses = names.map((n) => loadSoroswapFixture(n).status);
    expect(statuses.some((s) => s >= 200 && s < 300)).toBe(true);
    expect(statuses.some((s) => s >= 400)).toBe(true);
  });

  it.each(names)('%s has a capture date and no credentials', (name) => {
    const f = loadSoroswapFixture(name);
    expect(Date.parse(f.capturedAt)).not.toBeNaN();
    const text = readFileSync(path.join(__dirname, 'fixtures', 'soroswap', `${name}.json`), 'utf8');
    expect(text).not.toMatch(/authorization|bearer\s|x-api-key/i);
    expect(text).not.toMatch(/sk_[0-9a-f]{32,}/i);
  });
});

describe('createSoroswapHop.plan with recorded quotes', () => {
  const quotes = listSoroswapFixtures('mainnet-quote-');

  it('found recorded quote fixtures', () => {
    expect(quotes.length).toBeGreaterThan(0);
  });

  it.each(quotes)('plans a swap from %s', async (name) => {
    const f = loadSoroswapFixture(name);
    const req = f.request as { assetIn: string; assetOut: string; amount: string };
    const body = f.body as { amountOut: string };
    const calls = stubFetch(f);

    const hop = createSoroswapHop({ assetOutContract: req.assetOut, account: ACCOUNT });
    const result = await hop.plan({ asset: req.assetIn, amount: req.amount }, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.step.output).toEqual({ asset: req.assetOut, amount: body.amountOut });
    expect(result.step.details['quote']).toEqual(f.body);
    expect(calls[0]!.url).toContain('/quote?network=mainnet');
    expect(calls[0]!.body).toMatchObject({
      assetIn: req.assetIn,
      assetOut: req.assetOut,
      amount: req.amount,
      tradeType: 'EXACT_IN',
      protocols: ['soroswap', 'phoenix', 'aqua'],
    });
  });
});

describe('error shapes recorded from the live API', () => {
  const errors = [
    '400-no-path-found',
    '400-invalid-address',
    '400-bad-protocol',
    'quote-error-bad-amount',
    '403-forbidden',
  ];

  it.each(errors)('getSoroswapQuote throws SoroswapApiError for %s', async (name) => {
    const f = loadSoroswapFixture(name);
    stubFetch(f);
    const err = await getSoroswapQuote({
      assetIn: 'CAAA',
      assetOut: 'CBBB',
      amount: '10000000',
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SoroswapApiError);
    expect((err as SoroswapApiError).status).toBe(f.status);
    expect((err as SoroswapApiError).body).toEqual(f.body);
  });

  it.each(errors)('plan() reports %s as no_route with the HTTP status', async (name) => {
    const f = loadSoroswapFixture(name);
    stubFetch(f);
    const hop = createSoroswapHop({ assetOutContract: 'CBBB', account: ACCOUNT });
    const result = await hop.plan({ asset: 'CAAA', amount: '10000000' }, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no_route');
    expect(result.details).toContain(`HTTP ${f.status}`);
  });
});

describe('createSoroswapHop.execute with a recorded build error', () => {
  it('reports build_failed and sends the planned quote to /quote/build', async () => {
    const quote = loadSoroswapFixture('mainnet-quote-usdc-eurc');
    const build = loadSoroswapFixture('mainnet-build');
    const req = quote.request as { assetIn: string; assetOut: string; amount: string };
    const calls = stubFetch(quote, build);

    const hop = createSoroswapHop({ assetOutContract: req.assetOut, account: ACCOUNT });
    const planned = await hop.plan({ asset: req.assetIn, amount: req.amount }, {});
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const result = await hop.execute(planned.step as HopStep, {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('build_failed');
    expect(result.details).toContain('HTTP 400');
    expect(calls[1]!.url).toContain('/quote/build?network=mainnet');
    expect(calls[1]!.body['quote']).toEqual(quote.body);
    expect(calls[1]!.body['from']).toBe(ACCOUNT);
    expect(calls[1]!.body['to']).toBe(ACCOUNT);
  });
});
