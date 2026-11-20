/** A stand-in origin, so the check works the same on the server and in the browser. */
const BASE = "http://bona.invalid";

/**
 * The page to return to after signing in, or null when the value could leave
 * this site. Browsers read `\` as `/`, so `/\evil.example` is really
 * `//evil.example`; resolving the value and comparing origins catches that
 * and every other spelling of an external address.
 */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return null;
    // Check what is actually returned: dot segments can collapse into a
    // protocol-relative path, e.g. `/.//evil.example` becomes `//evil.example`.
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
