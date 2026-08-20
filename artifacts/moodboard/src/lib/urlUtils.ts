/** Prepends https:// to a bare domain/path the user typed without a scheme.
 *  Leaves an already-schemed URL untouched. */
export function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** A short, human-scannable label for a URL — the hostname, minus a leading
 *  www. Falls back to the raw string for anything that isn't a valid URL. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
