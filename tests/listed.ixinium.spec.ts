import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANCHORS } from '@/constants/anchors';
import { fixtureMismatches, getListedAnchorByDomain } from '@/lib/stellar/listed-anchors';

describe('listed operator: Ixinium', () => {
  const entry = getListedAnchorByDomain('ixinium.io');

  it('is an issuer-only entry, found by every domain', () => {
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('ixinium');
    expect(entry?.kind).toBe('issuer');
    for (const domain of entry?.domains ?? []) {
      expect(getListedAnchorByDomain(domain)).toBe(entry);
    }
  });

  it('lists exactly the XXA and IXAT assets', () => {
    expect(entry?.assets).toHaveLength(2);
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'XXA',
        issuer: 'GC4HS4CQCZULIOTGLLPGRAAMSBDLFRR6Y7HCUQG66LNQDISXKIXXADIM',
      })
    );
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'IXAT',
        issuer: 'GCSECMDTZDHAUCTZJO4Z3BGAGDKKV77TBGPBWPOAJUE6Z5N5JEU4CY4R',
      })
    );
  });

  it('matches its stellar.toml fixture', () => {
    const toml = readFileSync('tests/fixtures/listed/ixinium.toml', 'utf8');
    expect(entry && fixtureMismatches(entry, toml)).toEqual([]);
  });

  it('is not a routable anchor', () => {
    const domains = entry?.domains ?? [];
    for (const a of ANCHORS) {
      expect(domains).not.toContain(a.homeDomain);
      if (a.serviceDomain) expect(domains).not.toContain(a.serviceDomain);
    }
  });
});
