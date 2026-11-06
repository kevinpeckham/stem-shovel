/**
 * The header that lets a script past the firewall's bot protection on a
 * deployed stage (docs/security.md "Bot protection and the smoke-test
 * token"): a custom rule matches `x-smoketest-token` equal to the secret and
 * bypasses the managed ruleset, whatever address the request comes from.
 * `SMOKETEST_TOKEN` comes from the dev 1Password environment through varlock;
 * unset, a request goes out as it did before. The header goes only to the
 * stage's own origin: a redirect or a sitemap entry can point anywhere, and
 * the secret must not follow it (slx-web's smoke test learned that).
 */
export const SMOKETEST_HEADER = "x-smoketest-token";
const token = process.env.SMOKETEST_TOKEN ?? "";

/**
 * The headers for one request: the token when `url` is on `base`'s origin,
 * nothing otherwise.
 * @param {string} url
 * @param {string} base
 * @returns {Record<string, string>}
 */
export function smoketestHeaders(url, base) {
	if (!token) return {};
	return new URL(url).origin === new URL(base).origin ? { [SMOKETEST_HEADER]: token } : {};
}
