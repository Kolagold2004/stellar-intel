'use client';
import { VISIBLE_CORRIDORS } from '@/constants/anchors';
import type { Corridor } from '@/types';

export interface AssetOption {
  value: string;
  label: string;
}

/**
 * Derives dropdown options from a list of corridors.
 * - Options are distinct (from, fromIssuer) pairs in first-seen order.
 * - When code is unique, value and label equal the code.
 * - When two or more options share a code, the first 4 + last 4 characters of the
 *   issuer are appended to the label, and the value becomes `CODE:ISSUER`.
 */
export function assetOptions(corridors: readonly Corridor[] = VISIBLE_CORRIDORS): AssetOption[] {
  const seenPairs = new Set<string>();
  const pairs: { from: string; fromIssuer: string | null }[] = [];

  for (const c of corridors) {
    const key = `${c.from}:${c.fromIssuer ?? 'native'}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      pairs.push({ from: c.from, fromIssuer: c.fromIssuer ?? null });
    }
  }

  const codeCounts = new Map<string, number>();
  for (const p of pairs) {
    codeCounts.set(p.from, (codeCounts.get(p.from) ?? 0) + 1);
  }

  return pairs.map((p) => {
    const hasCollision = (codeCounts.get(p.from) ?? 0) > 1;
    if (!hasCollision) {
      return {
        value: p.from,
        label: p.from,
      };
    }

    const issuerSuffix = p.fromIssuer
      ? ` (${p.fromIssuer.slice(0, 4)}...${p.fromIssuer.slice(-4)})`
      : ' (native)';

    return {
      value: p.fromIssuer ? `${p.from}:${p.fromIssuer}` : `${p.from}:native`,
      label: `${p.from}${issuerSuffix}`,
    };
  });
}

export interface AssetSelectorProps {
  value: string;
  onChange: (value: string) => void;
  corridors?: readonly Corridor[];
}

/**
 * Dropdown for selecting a source (sold) asset ahead of the corridor picker.
 * Options are distinct (from, fromIssuer) pairs across the given corridors,
 * disambiguating issuers when codes collide.
 */
export function AssetSelector({
  value,
  onChange,
  corridors = VISIBLE_CORRIDORS,
}: AssetSelectorProps) {
  const options = assetOptions(corridors);

  return (
    <div>
      <label
        htmlFor="asset-select"
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-secondary-text"
      >
        Asset
        <kbd className="rounded border border-control-border px-1 font-mono text-[10px] font-normal text-secondary-text">
          A
        </kbd>
      </label>
      <select
        id="asset-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-control-border bg-bg-subtle px-3 py-2.5 text-sm text-primary-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
