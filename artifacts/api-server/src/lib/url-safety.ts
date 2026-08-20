import dns from "node:dns";
import net from "node:net";

// ─────────────────────────────────────────────────────────────────────────────
// SSRF guard for outbound fetches of user-supplied URLs. Rejects requests aimed
// at loopback, private, link-local (including cloud metadata endpoints like
// 169.254.169.254), CGNAT, and other reserved ranges — resolved via DNS so a
// hostname can't hide a private IP behind a public-looking domain.
//
// This has to be the *only* way the server fetches a user-supplied URL. It
// used to be one of two: fetch-og's route handler and its image-compression
// step both called the global fetch() directly, so a URL that never went near
// fetchPrice or districtPlace skipped the guard entirely. safeFetch now also
// owns the browser-identity headers every one of those callers was retyping —
// the caller most likely to introduce a new bypass is the one copy-pasting a
// header block, and the guard has to be the fetch, not a decision at the call
// site.
// ─────────────────────────────────────────────────────────────────────────────

/** Sent with every outbound fetch unless a caller overrides a specific key. */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

function mergeWithDefaultHeaders(custom: RequestInit["headers"]): Headers {
  const headers = new Headers(DEFAULT_HEADERS);
  if (custom) {
    for (const [key, value] of new Headers(custom)) headers.set(key, value);
  }
  return headers;
}

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

/** Expands an IPv6 address (in either full or `::`-compressed form) into its
 *  eight 16-bit groups. Returns null if `ip` isn't syntactically valid — callers
 *  only reach this after `net.isIPv6` has already confirmed it is, so null is
 *  unreachable in practice and only guards the arithmetic below. */
function parseIpv6Groups(ip: string): number[] | null {
  const parts = ip.split("::");
  if (parts.length > 2) return null;

  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const groups =
    parts.length === 1
      ? head
      : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];

  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

/** The embedded IPv4 of an IPv4-mapped (`::ffff:a.b.c.d`) or the deprecated
 *  IPv4-compatible (`::a.b.c.d`) form — both are the low 32 bits with the
 *  first 80 or 96 bits zero. `Node`'s URL parser always canonicalizes these
 *  into two hex groups (`::ffff:7f00:1`, never the dotted-decimal string), so
 *  this reads the groups numerically rather than matching a text pattern that
 *  the input is never actually in. */
function embeddedIpv4(groups: number[]): string | null {
  const isMappedOrCompatible =
    groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0);
  if (!isMappedOrCompatible) return null;
  const hi = groups[6];
  const lo = groups[7];
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fec0:")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique local fc00::/7

  const groups = parseIpv6Groups(normalized);
  const mapped = groups && embeddedIpv4(groups);
  if (mapped) return isReservedIpv4(mapped);

  return false;
}

function isReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isReservedIpv4(ip);
  if (net.isIPv6(ip)) return isReservedIpv6(ip);
  return true; // unrecognized format — fail closed
}

async function assertPublicHostname(hostname: string): Promise<void> {
  // A URL's IPv6 hostname is bracketed ("[::1]"), but net.isIP() only
  // recognizes the bare address. Without stripping the brackets first, every
  // IPv6-literal URL missed this fast path and fell through to the DNS branch
  // below — which happens to fail closed against a real resolver (no record
  // for "[::1]"), but skipped the reserved-range check that was supposed to
  // run here.
  const bareHost =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  if (net.isIP(bareHost)) {
    if (isReservedIp(bareHost)) {
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

/** The validation `safeFetch` runs before every hop. Exported so the SSRF
 *  rules are assertable on their own — an IP-literal URL exercises every
 *  reserved-range check below without a real DNS lookup; only a hostname URL
 *  needs one. */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
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
 * can't 302 its way to an internal address. Applies a default browser-like
 * header set; pass `init.headers` to override individual keys (other defaults
 * are kept) rather than retyping the whole block.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  const headers = mergeWithDefaultHeaders(init.headers);
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertSafeUrl(currentUrl);
    const response = await fetch(validated, { ...init, headers, redirect: "manual" });

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
