# One Outbound-Fetch Seam Implementation Plan

**Goal:** Make `safeFetch` the only way the server fetches a user-supplied URL. Close the two `/api/fetch-og` call sites that were using a bare `fetch()` and bypassing the SSRF guard, and absorb the three duplicated browser-header blocks into the guard itself.

**Architecture:** `src/lib/url-safety.ts` already had the SSRF guard (`safeFetch`) but two-thirds of its own package didn't route through it. This is a routing fix, not a new module: two `fetch()` calls in `routes/fetchOg.ts` switch to `safeFetch`, and the three copies of the same header block collapse into one default inside the guard.

**Working directory:** paths below are relative to `artifacts/api-server/`.

---

## The hole

CLAUDE.md states the invariant: *"Any outbound fetch of a user-supplied URL must go through `safeFetch`."* `grep -rn "safeFetch" src` showed it was only called from `lib/fetchPrice.ts` and `lib/districtPlace.ts`. Two direct-`fetch` call sites in `routes/fetchOg.ts` took a user-supplied URL straight to the network:

- The `/fetch-og` route handler fetched `req.query.url` directly.
- `compressToWebPDataUrl(imageUrl)` fetched whatever URL it was given — which, for the generic-scrape path, is `og:image` pulled out of the *attacker's own page*. Guarding this one function also covers the Microlink metadata/screenshot image paths for free, since all three routes into image compression share this one function.

Both are now `safeFetch` calls.

## What was declared out of scope, and why

Not every raw `fetch()` in the package needed the guard — only ones where a user-supplied string becomes the **connection target**, not just a query parameter to a fixed, trusted host:

- `routes/movieSearch.ts` — always fetches `www.omdbapi.com`; the query text is a parameter, not the host.
- `lib/districtIndex.ts` — fetches a hardcoded sitemap URL at boot, never anything from a request.
- The YouTube oEmbed and Microlink calls inside `fetchOg.ts` — both fetch a fixed host (`youtube.com`, `api.microlink.io`) with the user's URL embedded as a query parameter; the remote service, not this server, makes the actual request to that URL.

## Absorbing the header duplication

The same six-header block was typed three times (`fetchOg.ts`, `fetchPrice.ts`, `districtPlace.ts`), and `districtPlace.ts`'s copy quietly differed (`Accept-Language: en-IN` instead of `en-US`, no `Accept-Encoding`/`Pragma`). `safeFetch` now applies `DEFAULT_HEADERS` and merges any `init.headers` a caller passes over them — so `fetchOg.ts` and `fetchPrice.ts` drop their header blocks entirely, and `districtPlace.ts` keeps only the one header that's a deliberate choice (India-targeted `Accept-Language`), not a retyped default.

`BROWSER_UA` moved from `routes/fetchOg.ts` to `lib/url-safety.ts`: after the header block moved into `safeFetch`, nothing inside `fetchOg.ts` needed the constant any more, and its only remaining consumer, `districtIndex.ts`, now imports it from the file that actually owns the default header set. This shrinks (doesn't resolve) the `lib/` → `routes/` import direction flagged separately as candidate 07 — `fetchPrice.ts` and `districtPlace.ts` now import only `extractMetaContent` from `routes/fetchOg`, not `BROWSER_UA` too.

## Two bugs the new tests found

Writing `assertSafeUrl` tests as IP-literal URLs (the report's own "assertable without real DNS" claim) surfaced two pre-existing defects in `isReservedIpv6`, both now fixed in this change:

1. **Bracket mismatch.** `URL.hostname` returns an IPv6 literal bracketed (`"[::1]"`), but `net.isIP()` only recognizes the bare form. `assertPublicHostname` never stripped the brackets, so every IPv6-literal URL missed the direct IP check and fell through to the DNS-lookup branch instead. In production this failed closed (a real resolver has no record for `"[::1]"`), so it wasn't an open hole, but the reserved-range check was never exercised for this path — confirmed dead until the test suite (mocking DNS to always resolve) exposed it.
2. **Canonicalization mismatch.** The IPv4-mapped/compatible detection matched a literal `::ffff:a.b.c.d` string, but `new URL()` always canonicalizes that into two hex groups (`::ffff:7f00:1`) before `isReservedIpv6` ever sees it — the regex could never match real input. Replaced with `parseIpv6Groups`/`embeddedIpv4`, which read the groups numerically instead of pattern-matching a string shape the input is never actually in.

Neither was a live SSRF hole (both failed closed), but both meant the reserved-IPv6 logic didn't do what its own comments claimed. Confirmed via `node -e` against Node's actual `URL`/`net.isIP` behavior before writing the fix, not just from the failing test.

---

## File Structure

- **Modify** `src/lib/url-safety.ts` — `BROWSER_UA` + `DEFAULT_HEADERS` + `mergeWithDefaultHeaders`; `assertSafeUrl` exported; bracket-stripping in `assertPublicHostname`; `parseIpv6Groups`/`embeddedIpv4` replacing the dead regex.
- **Modify** `src/routes/fetchOg.ts` — both `fetch()` calls become `safeFetch()`; `BROWSER_UA` and its header block removed.
- **Modify** `src/lib/fetchPrice.ts`, `src/lib/districtPlace.ts` — header blocks dropped (districtPlace keeps its `Accept-Language` override); `BROWSER_UA` import dropped.
- **Modify** `src/lib/districtIndex.ts` — imports `BROWSER_UA` from `./url-safety` instead of `../routes/fetchOg`.
- **Create** `src/lib/url-safety.test.ts` — 33 cases.
- **Create** `vitest.config.ts`, and `test`/`test:watch` scripts — this package's first test runner.

---

## Verification

```bash
pnpm run typecheck                                    # all 4 packages
pnpm --filter @workspace/api-server run test           # 33 passing
pnpm --filter @workspace/api-server run build           # esbuild bundle
pnpm --filter @workspace/moodboard run test             # 37 passing, unaffected
PORT=20658 BASE_PATH=/ pnpm --filter @workspace/moodboard run build
```

No manual browser check applies here — this is a server-only, request-shape-preserving change. Worth a smoke test against a live deploy: fetch-og against a normal link, a YouTube link, an Instagram link, and a link that redirects, to confirm the fallback chain (direct scrape → Microlink) still behaves the same from the outside.
