import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANCHORS } from '@/constants/anchors';
import { LISTED_ANCHORS } from '@/constants/listed-anchors';
import {
  fixtureMismatches,
  getListedAnchorByDomain,
  getListedAnchorsByKind,
  listedRegistryViolations,
  tomlCurrencies,
} from '@/lib/stellar/listed-anchors';
import type { Anchor, ListedAnchor } from '@/types';

const ROOT = process.cwd();
const ISSUER_A = 'GCBNWTCCMC32UHZ5OCC2PNMFDGXRVPA7MFFBFFTCVW77SX5PMRB7Q4BY';
const ISSUER_B = 'GAIUGZZZSL47BKH27SUDZESZELFJDPE2UM52RACOSFJ7BIVBGKUEJSUZ';

const entry = (over: Partial<ListedAnchor> = {}): ListedAnchor => ({
  id: 'one',
  name: 'One',
  kind: 'issuer',
  domains: ['one.example'],
  orgUrl: null,
  verifiedAt: '2026-09-23',
  assets: [{ code: 'ONE', issuer: ISSUER_A, anchorAssetType: 'fiat', anchorAsset: 'USD' }],
  ...over,
});
const fakeAnchor = (over: Partial<Anchor> = {}): Anchor => ({
  id: 'routable',
  name: 'Routable',
  homeDomain: 'routable.example',
  corridors: [],
  assetCode: 'USDC',
  assetIssuer: ISSUER_B,
  ...over,
});

describe('listed registry', () => {
  it('has no violations against ANCHORS', () => {
    expect(listedRegistryViolations(LISTED_ANCHORS, ANCHORS)).toEqual([]);
  });

  it('has one imported JSON file per entry, named by id', () => {
    const files = readdirSync(join(ROOT, 'constants/listed-anchors'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(files).toEqual(LISTED_ANCHORS.map((e) => e.id).sort());
  });

  it.each(LISTED_ANCHORS.map((e) => [e.id, e] as const))('%s matches its toml fixture', (id, e) => {
    const path = join(ROOT, 'tests/fixtures/listed', `${id}.toml`);
    expect(existsSync(path)).toBe(true);
    expect(fixtureMismatches(e, readFileSync(path, 'utf8'))).toEqual([]);
  });
});

describe('listedRegistryViolations', () => {
  it('accepts a clean registry', () => {
    expect(listedRegistryViolations([entry()], [fakeAnchor()])).toEqual([]);
  });
  it('flags duplicate ids', () => {
    const b = entry({
      domains: ['two.example'],
      assets: [{ code: 'TWO', issuer: ISSUER_B, anchorAssetType: null, anchorAsset: null }],
    });
    expect(listedRegistryViolations([entry(), b], [])).toEqual([
      expect.stringContaining('duplicate listed id'),
    ]);
  });
  it('flags a listed id equal to an ANCHORS id', () => {
    expect(listedRegistryViolations([entry({ id: 'routable' })], [fakeAnchor()])).toEqual([
      expect.stringContaining('equals an ANCHORS id'),
    ]);
  });
  it('flags a domain in two listed entries', () => {
    const b = entry({
      id: 'two',
      assets: [{ code: 'TWO', issuer: ISSUER_B, anchorAssetType: null, anchorAsset: null }],
    });
    expect(listedRegistryViolations([entry(), b], [])).toEqual([
      expect.stringContaining('appears in listed entries'),
    ]);
  });
  it('flags a domain equal to an ANCHORS homeDomain or serviceDomain', () => {
    expect(
      listedRegistryViolations([entry({ domains: ['routable.example'] })], [fakeAnchor()])
    ).toHaveLength(1);
    expect(
      listedRegistryViolations([entry()], [fakeAnchor({ serviceDomain: 'ONE.example' })])
    ).toHaveLength(1);
  });
  it('flags a registeredAnchorId that is not in ANCHORS', () => {
    expect(
      listedRegistryViolations([entry({ registeredAnchorId: 'nope' })], [fakeAnchor()])
    ).toEqual([expect.stringContaining('registeredAnchorId')]);
    expect(
      listedRegistryViolations([entry({ registeredAnchorId: 'routable' })], [fakeAnchor()])
    ).toEqual([]);
  });
  it('flags a code:issuer pair listed twice, within one entry and across entries', () => {
    const dup = { code: 'ONE', issuer: ISSUER_A, anchorAssetType: null, anchorAsset: null };
    expect(listedRegistryViolations([entry({ assets: [dup, dup] })], [])).toHaveLength(1);
    const b = entry({ id: 'two', domains: ['two.example'], assets: [dup] });
    expect(listedRegistryViolations([entry(), b], [])).toHaveLength(1);
  });
});

describe('fixtureMismatches', () => {
  const toml = `[[CURRENCIES]]\ncode = "ONE"\nissuer = "${ISSUER_A}"\nanchor_asset_type = "fiat"\nanchor_asset = "USD"\n`;
  it('is empty when the fixture matches', () => {
    expect(fixtureMismatches(entry(), toml)).toEqual([]);
  });
  it('reports missing, extra and differing assets', () => {
    expect(fixtureMismatches(entry(), '')).toHaveLength(1);
    const extra = `${toml}\n[[CURRENCIES]]\ncode = "TWO"\nissuer = "${ISSUER_B}"\n`;
    expect(fixtureMismatches(entry(), extra)).toHaveLength(1);
    const diff = toml.replace('"USD"', '"EUR"').replace('"fiat"', '"crypto"');
    expect(fixtureMismatches(entry(), diff)).toHaveLength(2);
  });
});

describe('tomlCurrencies', () => {
  it('reads two blocks, with nulls when anchor_asset is absent, and stops at the next table', () => {
    const toml = `
[[CURRENCIES]]
code = "AAA"
issuer = "${ISSUER_A}"
anchor_asset_type = 'fiat'
anchor_asset = "USD"

[[CURRENCIES]]
code = "BBB"
issuer = "${ISSUER_B}"
desc = "no anchor asset"

[DOCUMENTATION]
code = "NOPE"
issuer = "${ISSUER_B}"
`;
    expect(tomlCurrencies(toml)).toEqual([
      { code: 'AAA', issuer: ISSUER_A, anchorAssetType: 'fiat', anchorAsset: 'USD' },
      { code: 'BBB', issuer: ISSUER_B, anchorAssetType: null, anchorAsset: null },
    ]);
  });
  it('skips blocks without code and issuer', () => {
    expect(tomlCurrencies('[[CURRENCIES]]\ncode = "X"\n')).toEqual([]);
  });
});

describe('lookups', () => {
  it('return undefined / empty over the current registry for unknown inputs', () => {
    expect(getListedAnchorByDomain('unknown.invalid')).toBeUndefined();
    expect(Array.isArray(getListedAnchorsByKind('crypto-rails'))).toBe(true);
  });
});
