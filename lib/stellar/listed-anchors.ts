/**
 * Guards and lookups for the listed-anchor registry. See constants/listed-anchors.
 */
import { LISTED_ANCHORS } from '@/constants/listed-anchors';
import type {
  Anchor,
  ListedAnchor,
  ListedAnchorKind,
  ListedAsset,
  Sep1AnchorAssetType,
} from '@/types';

const quoted = (body: string, key: string): string | null =>
  body.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*["']([^"']+)["']`, 'im'))?.[1] ?? null;

/**
 * TypeScript port of `parseCurrencies` in scripts/validate-anchors.mjs that also
 * reads `anchor_asset_type` and `anchor_asset`. Blocks lacking `code` or `issuer` are skipped.
 */
export function tomlCurrencies(toml: string): ListedAsset[] {
  const sections = toml.split(/^[ \t]*\[\[[ \t]*CURRENCIES[ \t]*\]\][ \t]*$/im).slice(1);
  const assets: ListedAsset[] = [];
  for (const section of sections) {
    const body = section.split(/^[ \t]*\[/m)[0] ?? '';
    const code = quoted(body, 'code');
    const issuer = quoted(body, 'issuer');
    if (!code || !issuer) continue;
    assets.push({
      code,
      issuer,
      anchorAssetType: quoted(body, 'anchor_asset_type') as Sep1AnchorAssetType | null,
      anchorAsset: quoted(body, 'anchor_asset'),
    });
  }
  return assets;
}

const assetKey = (a: { code: string; issuer: string }): string => `${a.code}:${a.issuer}`;

/** Differences between an entry's assets and the toml fixture it was copied from. */
export function fixtureMismatches(entry: ListedAnchor, toml: string): string[] {
  const fixture = new Map(tomlCurrencies(toml).map((a) => [assetKey(a), a]));
  const listed = new Map(entry.assets.map((a) => [assetKey(a), a]));
  const out: string[] = [];
  for (const [key, asset] of listed) {
    const other = fixture.get(key);
    if (!other) {
      out.push(`${entry.id}: asset ${key} is missing from the fixture`);
      continue;
    }
    if (asset.anchorAssetType !== other.anchorAssetType) {
      out.push(
        `${entry.id}: ${key} anchorAssetType ${String(asset.anchorAssetType)} != fixture ${String(other.anchorAssetType)}`
      );
    }
    if (asset.anchorAsset !== other.anchorAsset) {
      out.push(
        `${entry.id}: ${key} anchorAsset ${String(asset.anchorAsset)} != fixture ${String(other.anchorAsset)}`
      );
    }
  }
  for (const key of fixture.keys()) {
    if (!listed.has(key)) out.push(`${entry.id}: fixture asset ${key} is not listed`);
  }
  return out;
}

/** One message per rule violation across the registry and the routable anchors. */
export function listedRegistryViolations(
  listed: readonly ListedAnchor[],
  anchors: readonly Anchor[]
): string[] {
  const out: string[] = [];
  const anchorIds = new Set(anchors.map((a) => a.id));
  const anchorDomains = new Set<string>();
  for (const a of anchors) {
    anchorDomains.add(a.homeDomain.toLowerCase());
    if (a.serviceDomain) anchorDomains.add(a.serviceDomain.toLowerCase());
  }
  const ids = new Set<string>();
  const domainOwner = new Map<string, string>();
  const pairOwner = new Map<string, string>();
  for (const entry of listed) {
    if (ids.has(entry.id)) out.push(`duplicate listed id: ${entry.id}`);
    ids.add(entry.id);
    if (anchorIds.has(entry.id)) out.push(`${entry.id}: listed id equals an ANCHORS id`);
    for (const domain of entry.domains) {
      const d = domain.toLowerCase();
      const owner = domainOwner.get(d);
      if (owner !== undefined)
        out.push(`domain ${d} appears in listed entries ${owner} and ${entry.id}`);
      else domainOwner.set(d, entry.id);
      if (anchorDomains.has(d)) {
        out.push(`${entry.id}: domain ${d} is an ANCHORS homeDomain or serviceDomain`);
      }
    }
    if (entry.registeredAnchorId !== undefined && !anchorIds.has(entry.registeredAnchorId)) {
      out.push(`${entry.id}: registeredAnchorId ${entry.registeredAnchorId} is not in ANCHORS`);
    }
    for (const asset of entry.assets) {
      const key = assetKey(asset);
      const owner = pairOwner.get(key);
      if (owner !== undefined)
        out.push(`asset ${key} appears more than once (${owner}, ${entry.id})`);
      else pairOwner.set(key, entry.id);
    }
  }
  return out;
}

/** Case-insensitive lookup over every entry of `domains`. */
export function getListedAnchorByDomain(domain: string): ListedAnchor | undefined {
  const d = domain.toLowerCase();
  return LISTED_ANCHORS.find((e) => e.domains.some((x) => x.toLowerCase() === d));
}

export function getListedAnchorsByKind(kind: ListedAnchorKind): ListedAnchor[] {
  return LISTED_ANCHORS.filter((e) => e.kind === kind);
}
