/**
 * Zod schemas for the listed-anchor registry (`constants/listed-anchors`).
 * Deliberately does not import from `@/constants`, so the constants can use it.
 */
import { z } from 'zod';
import type { ListedAnchor } from '@/types';

const ASSET_TYPES = [
  'fiat',
  'crypto',
  'nft',
  'stock',
  'bond',
  'commodity',
  'realestate',
  'other',
] as const;

// Lower-case-only form of HOSTNAME_RE in scripts/validate-anchors.mjs.
const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const nonEmpty = z.string().min(1);

export const ListedAssetSchema = z.strictObject({
  code: z.string().regex(/^[A-Za-z0-9]{1,12}$/),
  issuer: z.string().regex(/^G[A-Z2-7]{55}$/),
  anchorAssetType: z.enum(ASSET_TYPES).nullable(),
  anchorAsset: nonEmpty.nullable(),
});

export const ListedCryptoRailSchema = z
  .strictObject({
    sep: z.enum(['sep6', 'sep24']),
    transferServer: z.string().startsWith('https://'),
    depositAssets: z.array(nonEmpty),
    withdrawAssets: z.array(nonEmpty),
    withdrawTypes: z.array(nonEmpty),
  })
  .refine((rail) => rail.depositAssets.length > 0 || rail.withdrawAssets.length > 0, {
    message: 'depositAssets and withdrawAssets must not both be empty',
  });

const common = {
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: nonEmpty,
  domains: z.array(z.string().regex(HOSTNAME_RE)).min(1),
  orgUrl: z
    .string()
    .regex(/^https?:\/\/\S+$/)
    .nullable(),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assets: z.array(ListedAssetSchema).min(1),
  registeredAnchorId: nonEmpty.optional(),
  note: nonEmpty.optional(),
};

export const ListedAnchorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('issuer') }),
  z.strictObject({
    ...common,
    kind: z.literal('crypto-rails'),
    cryptoRails: z.array(ListedCryptoRailSchema).min(1),
  }),
]);

/** Parse every element; throws naming the element index, its `id` and the zod issue paths. */
export function parseListedAnchors(raw: readonly unknown[]): ListedAnchor[] {
  return raw.map((item, index) => {
    const result = ListedAnchorSchema.safeParse(item);
    if (result.success) return result.data as ListedAnchor;
    const id =
      typeof item === 'object' && item !== null && 'id' in item
        ? String((item as { id: unknown }).id)
        : undefined;
    const paths = result.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
    throw new Error(
      `Invalid listed anchor at index ${index}${id !== undefined ? ` (id: ${id})` : ''}: ${paths}`
    );
  });
}
