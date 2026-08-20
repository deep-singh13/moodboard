import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// dns.promises.lookup is mocked per-test rather than hit for real: it is only
// exercised by the hostname (non-IP-literal) cases below, so the reserved-range
// logic itself is asserted through IP-literal URLs, which assertSafeUrl
// short-circuits past DNS entirely (net.isIP(hostname) is true for those).
vi.mock("node:dns", () => ({
  default: { promises: { lookup: vi.fn() } },
}));

import dns from "node:dns";
import { assertSafeUrl, safeFetch, BROWSER_UA } from "./url-safety";

const mockLookup = vi.mocked(dns.promises.lookup);

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("assertSafeUrl — scheme and credentials", () => {
  it("rejects an unparseable URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(/invalid url/i);
  });

  it("rejects a non-http(s) scheme", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(/scheme/i);
    await expect(assertSafeUrl("ftp://example.com/x")).rejects.toThrow(/scheme/i);
  });

  it("rejects embedded credentials", async () => {
    await expect(assertSafeUrl("http://user:pass@example.com/")).rejects.toThrow(
      /credentials/i,
    );
  });

  it("accepts a plain https URL to a public host", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeUrl("https://example.com/page")).resolves.toBeInstanceOf(URL);
  });
});

describe("assertSafeUrl — reserved IPv4 ranges (IP literal, no DNS)", () => {
  const cases: Array<[string, string]> = [
    ["loopback", "http://127.0.0.1/"],
    ["this-network", "http://0.0.0.1/"],
    ["private-10", "http://10.1.2.3/"],
    ["cgnat", "http://100.64.0.1/"],
    ["link-local incl. cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["private-172", "http://172.16.5.5/"],
    ["private-192.168", "http://192.168.1.1/"],
    ["test-net-1", "http://192.0.2.10/"],
    ["benchmarking", "http://198.18.0.5/"],
    ["multicast", "http://224.0.0.1/"],
    ["broadcast", "http://255.255.255.255/"],
  ];

  it.each(cases)("rejects %s (%s)", async (_label, url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow(/reserved|private/i);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("does not reject a public IPv4 literal", async () => {
    await expect(assertSafeUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });
});

describe("assertSafeUrl — reserved IPv6 ranges (IP literal, no DNS)", () => {
  it("rejects ::1 and ::", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow(/reserved|private/i);
    await expect(assertSafeUrl("http://[::]/")).rejects.toThrow(/reserved|private/i);
  });

  it("rejects link-local fe80::/10", async () => {
    await expect(assertSafeUrl("http://[fe80::1]/")).rejects.toThrow(/reserved|private/i);
  });

  it("rejects unique-local fc00::/7", async () => {
    await expect(assertSafeUrl("http://[fd12::1]/")).rejects.toThrow(/reserved|private/i);
  });

  it("rejects an IPv4-mapped address pointing at a reserved IPv4", async () => {
    // The exact bypass this exists to close: a scheme that looks like a
    // distinct address family but resolves to loopback underneath.
    await expect(assertSafeUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(
      /reserved|private/i,
    );
  });

  it("does not reject a public IPv6 literal", async () => {
    await expect(assertSafeUrl("http://[2606:4700:4700::1111]/")).resolves.toBeInstanceOf(
      URL,
    );
  });
});

describe("assertSafeUrl — hostnames resolved via DNS", () => {
  it("rejects a public-looking hostname that resolves to a private address", async () => {
    // The scenario the module exists for: a hostname can't hide a private IP
    // behind a public-looking domain.
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    await expect(assertSafeUrl("https://internal.example.com/")).rejects.toThrow(
      /reserved|private/i,
    );
  });

  it("rejects when any resolved address is reserved, not just the first", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ] as never);
    await expect(assertSafeUrl("https://multi-homed.example.com/")).rejects.toThrow(
      /reserved|private/i,
    );
  });

  it("rejects a hostname with no DNS records", async () => {
    mockLookup.mockResolvedValue([] as never);
    await expect(assertSafeUrl("https://nowhere.example.com/")).rejects.toThrow(
      /no addresses/i,
    );
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeUrl("https://public.example.com/")).resolves.toBeInstanceOf(
      URL,
    );
  });
});

describe("safeFetch — the SSRF guard actually gates the network call", () => {
  it("never calls fetch for a rejected URL", async () => {
    await expect(safeFetch("http://169.254.169.254/")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls fetch once for an accepted URL with no redirect", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    const res = await safeFetch("https://example.com/");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("safeFetch — redirect re-validation", () => {
  it("re-validates and rejects a redirect that lands on a private address", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValueOnce(redirectTo("http://169.254.169.254/secret"));

    await expect(safeFetch("https://example.com/redirect-me")).rejects.toThrow(
      /reserved|private/i,
    );
    // The malicious hop must never be requested.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to a safe address and returns that response", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectTo("https://example.com/final"))
      .mockResolvedValueOnce(jsonResponse({ landed: true }));

    const res = await safeFetch("https://example.com/start");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ landed: true });
  });

  it("gives up after maxRedirects hops", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValue(redirectTo("https://example.com/again"));

    await expect(safeFetch("https://example.com/start", {}, 2)).rejects.toThrow(
      /too many redirects/i,
    );
    expect(fetch).toHaveBeenCalledTimes(3); // the initial hop + 2 redirects
  });

  it("returns a redirect response as-is when it carries no Location header", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 304 }));

    const res = await safeFetch("https://example.com/");
    expect(res.status).toBe(304);
  });
});

describe("safeFetch — default headers", () => {
  it("sends the default browser-identity headers when the caller passes none", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));

    await safeFetch("https://example.com/");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("user-agent")).toBe(BROWSER_UA);
    expect(headers.get("accept-language")).toBe("en-US,en;q=0.9");
  });

  it("lets a caller override one header while keeping the rest of the defaults", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));

    await safeFetch("https://example.com/", {
      headers: { "Accept-Language": "en-IN,en;q=0.9" },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("accept-language")).toBe("en-IN,en;q=0.9");
    expect(headers.get("user-agent")).toBe(BROWSER_UA);
  });
});
