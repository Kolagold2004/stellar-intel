import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MULTI_PART_SUFFIXES,
  isImpersonation,
  registrableDomain,
} from '../scripts/lib/impersonation.mjs';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/survey/impersonation.json'), 'utf8')
);

describe('impersonation: census positives (ANC050)', () => {
  it('flags all 22 look-alike tomls pointing at other institutions', () => {
    expect(fixture.positives).toHaveLength(22);
    for (const { toml, url } of fixture.positives) {
      expect(isImpersonation(toml, [url]), `${toml} -> ${url}`).toBe(true);
    }
  });
});

describe('impersonation: legitimate rails', () => {
  it('does not flag foreign or same-domain rails', () => {
    for (const { toml, url } of fixture.negatives) {
      expect(isImpersonation(toml, [url]), `${toml} -> ${url}`).toBe(false);
    }
  });

  it('ignores missing or relative endpoint values', () => {
    expect(isImpersonation('anclap.com', [null, undefined, ''])).toBe(false);
    expect(isImpersonation('anclap.com', ['/relative/path'])).toBe(false);
    expect(isImpersonation('anclap.com', [])).toBe(false);
  });
});

describe('impersonation: registrableDomain', () => {
  it('covers every multi-part suffix rule', () => {
    for (const suffix of MULTI_PART_SUFFIXES) {
      expect(registrableDomain(`brand.${suffix}`)).toBe(`brand.${suffix}`);
    }
  });

  it('matches the fixture suffix cases', () => {
    for (const { host, expected } of fixture.suffixes) {
      expect(registrableDomain(host), host).toBe(expected);
    }
  });
});
