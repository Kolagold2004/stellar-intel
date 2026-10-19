// Look-alike / impersonation toml detection (ANC050).
//
// The census found stellar.toml files on look-alike domains (`vanguard.co.com`,
// `goldmansachs.com.co`, `*.pages.dev`) whose TRANSFER_SERVER / WEB_AUTH_ENDPOINT
// point at real institutions' API hosts (`api.vanguard.com`) or at
// `api.stellar.org`. Any crawler that trusts toml contents counts them as
// transfer-capable anchors, so the survey flags them (`excluded:
// 'impersonation' in scripts/anchor-survey.mjs) instead of counting them.
//
// Deliberately dependency-free: no full public-suffix list, just the small
// MULTI_PART_SUFFIXES table the census needed.

/**
 * Multi-label public suffixes the census hit. A host whose last two labels
 * are one of these is registered one level deeper (e.g. `vanguard.co.com`,
 * not `co.com`).
 */
export const MULTI_PART_SUFFIXES = [
  'co.com',
  'com.co',
  'pages.dev',
  'com.ph',
  'com.br',
  'com.ar',
  'co.uk',
  'com.au',
  'co.za',
];

/**
 * Best-effort registrable domain: the last two labels, or the last three
 * when the last two form a known multi-part suffix.
 *
 * @param {string} host
 * @returns {string | null} lower-cased registrable domain, or null for empty input
 */
export function registrableDomain(host) {
  if (typeof host !== 'string') return null;
  const normalized = host.trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) return null;
  const labels = normalized.split('.');
  if (labels.length < 2) return normalized;
  if (MULTI_PART_SUFFIXES.includes(labels.slice(-2).join('.')) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

/** Host is stellar.org itself or a subdomain of it. */
function isStellarOrgHost(host) {
  return host === 'stellar.org' || host.endsWith('.stellar.org');
}

/** Lower-cased labels of a domain, for brand-borrowing checks. */
function labelsOf(domain) {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
    .split('.')
    .filter(Boolean);
}

/**
 * True when ANY endpoint URL points at a host whose registrable domain differs
 * from the toml domain's AND at least one impersonation signal holds:
 * (a) brand borrowing — the first label of the endpoint's registrable domain
 * appears as a label of the toml domain; (b) stellar.org rail — the endpoint
 * host is stellar.org (or a subdomain) while the toml domain is not under
 * stellar.org; (c) the toml domain itself sits under `.co.com` / `.com.co`.
 *
 * @param {string} tomlDomain the domain the stellar.toml was fetched from
 * @param {Array<string | null | undefined>} endpointUrls SEP endpoint URLs
 * @returns {boolean}
 */
export function isImpersonation(tomlDomain, endpointUrls) {
  if (typeof tomlDomain !== 'string' || !Array.isArray(endpointUrls)) return false;
  const tomlLabels = labelsOf(tomlDomain);
  if (tomlLabels.length === 0) return false;
  const tomlHost = tomlLabels.join('.');
  const tomlRegistrable = registrableDomain(tomlHost);

  for (const value of endpointUrls) {
    if (typeof value !== 'string' || !value) continue;
    let host;
    try {
      host = new URL(value).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!host || host === tomlHost) continue;
    const endpointRegistrable = registrableDomain(host);
    if (!endpointRegistrable || endpointRegistrable === tomlRegistrable) continue;

    // (c) look-alike suffix on the toml side alone is enough.
    if (tomlHost.endsWith('.co.com') || tomlHost.endsWith('.com.co')) return true;
    // (a) the endpoint's brand appears inside the toml domain's labels.
    if (tomlLabels.includes(endpointRegistrable.split('.')[0])) return true;
    // (b) someone else's toml pointing rails at stellar.org infrastructure.
    if (isStellarOrgHost(host) && !isStellarOrgHost(tomlHost)) return true;
  }
  return false;
}
