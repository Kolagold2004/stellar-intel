import { STELLAR_PUBKEY_PATTERN } from '@/lib/patterns';

export interface Config {
  stellarNetwork: 'mainnet' | 'testnet' | 'futurenet';
  horizonUrl: string;
  usdcIssuer: string;
  appName: string;
}

// Network passphrases for Stellar networks
const NETWORK_PASSPHRASES = {
  mainnet: 'Public Global Stellar Network ; September 2015',
  testnet: 'Test SDF Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
} as const;

/**
 * The USDC issuer and Horizon host are fixed per network. Pinning them here
 * closes the #1104 attack surface: previously a single env change could
 * redirect issuer checks and transaction submission on every path without
 * failing any check, since both values were only checked for *format*
 * (a valid-looking `G...` key, a valid-looking URL) rather than against the
 * one correct value for the configured network.
 *
 * `futurenet` intentionally has no entry — there is no single canonical USDC
 * issuer or Horizon host for it, so it is not checked.
 */
export const CANONICAL_NETWORK_VALUES: Readonly<
  Partial<Record<Config['stellarNetwork'], { usdcIssuer: string; horizonHost: string }>>
> = Object.freeze({
  mainnet: Object.freeze({
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    horizonHost: 'horizon.stellar.org',
  }),
  testnet: Object.freeze({
    usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    horizonHost: 'horizon-testnet.stellar.org',
  }),
});

function validateEnv(): void {
  const requiredVars = [
    'NEXT_PUBLIC_STELLAR_NETWORK',
    'NEXT_PUBLIC_HORIZON_URL',
    'NEXT_PUBLIC_USDC_ISSUER',
    'NEXT_PUBLIC_APP_NAME',
  ] as const;

  const missing = requiredVars.filter(
    (varName) => !process.env[varName] || process.env[varName]?.trim() === ''
  );

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables:\n` +
        missing.map((v) => `   - ${v}`).join('\n') +
        `\n\nPlease check your .env.local file and ensure all variables are set.`
    );
  }

  // Additional validation for specific variable formats
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  if (network !== 'mainnet' && network !== 'testnet' && network !== 'futurenet') {
    throw new Error(
      `❌ Invalid NEXT_PUBLIC_STELLAR_NETWORK: "${network}"\n` +
        `   Must be one of: mainnet, testnet, futurenet`
    );
  }

  const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL!;
  try {
    new URL(horizonUrl);
  } catch {
    throw new Error(
      `❌ Invalid NEXT_PUBLIC_HORIZON_URL: "${horizonUrl}"\n` +
        `   Must be a valid URL (e.g., https://horizon.stellar.org)`
    );
  }

  const issuer = process.env.NEXT_PUBLIC_USDC_ISSUER!;
  if (!STELLAR_PUBKEY_PATTERN.test(issuer)) {
    throw new Error(
      `❌ Invalid NEXT_PUBLIC_USDC_ISSUER: "${issuer}"\n` +
        `   Must be a valid Stellar public key (starts with 'G', 56 characters total)`
    );
  }

  // Pin the USDC issuer and Horizon host to the one correct value for the
  // configured network (#1104 / #1333). `network` was validated above, so
  // this indexes CANONICAL_NETWORK_VALUES with a known key.
  const canonical = CANONICAL_NETWORK_VALUES[network as Config['stellarNetwork']];
  if (canonical) {
    if (issuer !== canonical.usdcIssuer) {
      throw new Error(
        `❌ Invalid NEXT_PUBLIC_USDC_ISSUER: "${issuer}"\n` +
          `   Expected the canonical ${network} USDC issuer: "${canonical.usdcIssuer}"`
      );
    }

    let horizon: URL;
    try {
      horizon = new URL(horizonUrl);
    } catch {
      // Already thrown above by the format check; unreachable in practice.
      throw new Error(`❌ Invalid NEXT_PUBLIC_HORIZON_URL: "${horizonUrl}"`);
    }

    if (horizon.protocol !== 'https:' || horizon.hostname !== canonical.horizonHost) {
      throw new Error(
        `❌ Invalid NEXT_PUBLIC_HORIZON_URL: "${horizonUrl}"\n` +
          `   Expected the canonical ${network} Horizon host: "https://${canonical.horizonHost}"`
      );
    }
  }
}

// Only validate on the server. In the browser, Next.js inlines NEXT_PUBLIC_*
// values at compile time so process.env is empty — validation would always fail.
if (typeof window === 'undefined') {
  validateEnv();
}

/**
 * Typed configuration object.
 * Safe to import anywhere in the application.
 */
export const config: Config = {
  stellarNetwork: process.env.NEXT_PUBLIC_STELLAR_NETWORK as Config['stellarNetwork'],
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL!,
  usdcIssuer: process.env.NEXT_PUBLIC_USDC_ISSUER!,
  appName: process.env.NEXT_PUBLIC_APP_NAME!,
};

// Freeze to prevent accidental mutations
Object.freeze(config);

// Individual named exports for commonly used values
export const HORIZON_URL = config.horizonUrl;
export const USDC_ISSUER = config.usdcIssuer;
export const NETWORK_PASSPHRASE = NETWORK_PASSPHRASES[config.stellarNetwork];
