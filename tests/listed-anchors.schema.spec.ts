import { describe, it, expect } from 'vitest';
import { ListedAnchorSchema, parseListedAnchors } from '@/lib/stellar/listed-anchor-schema';
import { LISTED_ANCHORS } from '@/constants/listed-anchors';

const ISSUER = 'GCBNWTCCMC32UHZ5OCC2PNMFDGXRVPA7MFFBFFTCVW77SX5PMRB7Q4BY';

const asset = () => ({ code: 'ABC', issuer: ISSUER, anchorAssetType: 'fiat', anchorAsset: 'USD' });
const issuerEntry = (): Record<string, unknown> => ({
  id: 'example',
  name: 'Example',
  kind: 'issuer',
  domains: ['example.com'],
  orgUrl: 'https://example.com/',
  verifiedAt: '2026-09-23',
  assets: [asset()],
});
const rail = () => ({
  sep: 'sep24',
  transferServer: 'https://api.example.com/sep24',
  depositAssets: ['BTC'],
  withdrawAssets: ['BTC'],
  withdrawTypes: ['crypto'],
});
const railsEntry = (): Record<string, unknown> => ({
  ...issuerEntry(),
  kind: 'crypto-rails',
  cryptoRails: [rail()],
});

describe('ListedAnchorSchema', () => {
  it('parses a minimal issuer entry and a minimal crypto-rails entry', () => {
    expect(ListedAnchorSchema.safeParse(issuerEntry()).success).toBe(true);
    expect(ListedAnchorSchema.safeParse(railsEntry()).success).toBe(true);
  });

  it('accepts a null orgUrl and null anchor fields', () => {
    const e = issuerEntry();
    e.orgUrl = null;
    e.assets = [{ ...asset(), anchorAssetType: null, anchorAsset: null }];
    expect(ListedAnchorSchema.safeParse(e).success).toBe(true);
  });

  it.each<[string, () => Record<string, unknown>]>([
    ['issuer with cryptoRails', () => ({ ...issuerEntry(), cryptoRails: [rail()] })],
    [
      'crypto-rails without rails',
      () => {
        const e = railsEntry();
        delete e.cryptoRails;
        return e;
      },
    ],
    [
      'issuer key of the wrong length',
      () => ({ ...issuerEntry(), assets: [{ ...asset(), issuer: ISSUER.slice(1) }] }),
    ],
    ['domain with an upper-case letter', () => ({ ...issuerEntry(), domains: ['Example.com'] })],
    [
      'transferServer over http',
      () => ({
        ...railsEntry(),
        cryptoRails: [{ ...rail(), transferServer: 'http://api.example.com' }],
      }),
    ],
    [
      'rail with both asset lists empty',
      () => ({
        ...railsEntry(),
        cryptoRails: [{ ...rail(), depositAssets: [], withdrawAssets: [] }],
      }),
    ],
    ['unknown top-level key', () => ({ ...issuerEntry(), extra: 1 })],
    ['verifiedAt in the wrong format', () => ({ ...issuerEntry(), verifiedAt: '23-09-2026' })],
    [
      'anchorAssetType outside the enum',
      () => ({ ...issuerEntry(), assets: [{ ...asset(), anchorAssetType: 'gold' }] }),
    ],
  ])('rejects %s', (_name, make) => {
    expect(ListedAnchorSchema.safeParse(make()).success).toBe(false);
  });
});

describe('parseListedAnchors', () => {
  it('names the bad entry id, index and issue path in the error', () => {
    const bad = { ...issuerEntry(), id: 'bad-one', verifiedAt: 'nope' };
    expect(() => parseListedAnchors([issuerEntry(), bad])).toThrow(/index 1.*bad-one.*verifiedAt/);
  });

  it('returns the parsed entries', () => {
    expect(parseListedAnchors([issuerEntry()])).toHaveLength(1);
  });
});

describe('LISTED_ANCHORS', () => {
  it('is an array', () => {
    expect(Array.isArray(LISTED_ANCHORS)).toBe(true);
  });
});
