/**
 * The URL `@libsql/client` will open. Turso's newer dashboard and CLI hand
 * out `turso://…` URLs, which Turso's own serverless drivers accept as a
 * synonym of `libsql://`; `@libsql/client` (0.18) does not, so the scheme
 * is swapped here and either form can be pasted into 1Password.
 */
export function libsqlUrl(url: string): string {
	return url.replace(/^turso:\/\//i, "libsql://");
}
