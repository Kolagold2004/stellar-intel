/**
 * lib/stellar/client-domain.ts
 *
 * Stellar Intel's own SEP-10 `client_domain` signing key (ANC058).
 *
 * MoneyGram and other anchors only accept SEP-10 logins from wallets that
 * prove a `client_domain`: the anchor fetches this app's stellar.toml
 * (app/.well-known/stellar.toml/route.ts), reads its `SIGNING_KEY`, and
 * requires that key's signature on the SEP-10 challenge alongside the
 * user's own. This module is the single source of truth for that key, read
 * from a server-only secret — never a `NEXT_PUBLIC_` var, since the secret
 * must never reach the client bundle.
 *
 * Server-only: do not import from a client component.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { getLogger } from '@/lib/logger';

const log = getLogger('stellar/client-domain');

export interface ClientDomainConfig {
  domain: string;
  signingPublicKey: string;
}

/** Derives the client_domain hostname from NEXT_PUBLIC_SITE_URL, falling back to the Vercel default. */
function defaultClientDomain(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stellar-intel.vercel.app';
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return 'stellar-intel.vercel.app';
  }
}

/**
 * Loads the client-domain signing keypair from `SEP10_CLIENT_DOMAIN_SIGNING_SECRET`.
 * Returns `null` when the secret is unset, or when it is set but is not a valid
 * Stellar secret key (logged as a warning rather than thrown, so a
 * misconfigured secret degrades to "no client_domain support" instead of
 * crashing every request that touches this module).
 */
export function getClientDomainKeypair(): InstanceType<typeof Keypair> | null {
  const secret = process.env.SEP10_CLIENT_DOMAIN_SIGNING_SECRET;
  if (!secret || secret.trim() === '') return null;

  try {
    return Keypair.fromSecret(secret);
  } catch {
    log.warn({ event: 'client_domain_secret_invalid' }, 'SEP10_CLIENT_DOMAIN_SIGNING_SECRET is not a valid Stellar secret key');
    return null;
  }
}

/**
 * Public client-domain config for stellar.toml: the hostname wallets should
 * pass as `client_domain`, and the public key anchors verify the SEP-10
 * co-signature against. Returns `null` under the same conditions as
 * {@link getClientDomainKeypair} — there is nothing to publish without a key.
 */
export function getClientDomainConfig(): ClientDomainConfig | null {
  const keypair = getClientDomainKeypair();
  if (!keypair) return null;

  const domain = process.env.NEXT_PUBLIC_SEP10_CLIENT_DOMAIN ?? defaultClientDomain();
  return { domain, signingPublicKey: keypair.publicKey() };
}
