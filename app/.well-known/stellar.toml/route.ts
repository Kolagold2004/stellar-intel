import { NextResponse } from 'next/server';
import { NETWORK_PASSPHRASE } from '@/lib/config';
import { getClientDomainConfig } from '@/lib/stellar/client-domain';

// ─── GET /.well-known/stellar.toml (ANC058) ────────────────────────────────
//
// SEP-1: publishes this app's own stellar.toml so anchors that require SEP-10
// `client_domain` proof (MoneyGram among them) can fetch our SIGNING_KEY and
// verify our co-signature on their auth challenge. `SIGNING_KEY` is only
// emitted when SEP10_CLIENT_DOMAIN_SIGNING_SECRET is configured — its absence
// is not an error, just "no client_domain support yet".

export const dynamic = 'force-dynamic';

function buildToml(): string {
  const clientDomain = getClientDomainConfig();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stellar-intel.vercel.app';

  const lines = [
    'VERSION = "2.7.0"',
    '',
    `NETWORK_PASSPHRASE = "${NETWORK_PASSPHRASE}"`,
  ];

  if (clientDomain) {
    lines.push(`SIGNING_KEY = "${clientDomain.signingPublicKey}"`);
  }

  lines.push(
    '',
    '[DOCUMENTATION]',
    'ORG_NAME = "Stellar Intel"',
    `ORG_URL = "${siteUrl}"`,
    'ORG_DESCRIPTION = "Off-ramp rate comparison and execution client for Stellar anchors."'
  );

  return lines.join('\n') + '\n';
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(buildToml(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
