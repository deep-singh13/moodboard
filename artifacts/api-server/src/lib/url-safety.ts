import dns from "node:dns";
import net from "node:net";

// ─────────────────────────────────────────────────────────────────────────────
// SSRF guard for outbound fetches of user-supplied URLs (fetch-price). Rejects
// requests aimed at loopback, private, link-local (including cloud metadata
// endpoints like 169.254.169.254), CGNAT, and other reserved ranges — resolved
// via DNS so hostnames can't hide a private IP behind a public-looking domain.
// ─────────────────────────────────────────────────────────────────────────────

const IPV4_RESERVED_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InRange(ip: string, rangeStart: string, prefixBits: number): boolean {
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(rangeStart) & mask);
}

function isReservedIpv4(ip: string): boolean {
  return IPV4_RESERVED_RANGES.some(([range, bits]) => isIpv4InRange(ip, range, bits));
}

function isReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fec0:")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique local fc00::/7

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) — check the embedded IPv4
  const mapped = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isReservedIpv4(mapped[1]);

  return false;
}

function isReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isReservedIpv4(ip);
  if (net.isIPv6(ip)) return isReservedIpv6(ip);
  return true; // unrecognized format — fail closed
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isReservedIp(hostname)) {
      throw new Error(`Refusing to fetch reserved/private address: ${hostname}`);
    }
    return;
  }

  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error(`DNS lookup returned no addresses for host: ${hostname}`);
  }
  for (const { address } of records) {
    if (isReservedIp(address)) {
      throw new Error(
        `Refusing to fetch host "${hostname}" — resolves to reserved/private address ${address}`,
      );
    }
  }
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  await assertPublicHostname(url.hostname);
  return url;
}

/**
 * fetch() wrapper for user-supplied URLs. Validates scheme + resolved IP
 * before every request, and re-validates on each redirect hop (redirects are
 * followed manually rather than automatically) so a same-origin-looking URL
 * can't 302 its way to an internal address.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertSafeUrl(currentUrl);
    const response = await fetch(validated, { ...init, redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, validated).toString();
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (> ${maxRedirects}) fetching ${rawUrl}`);
}
