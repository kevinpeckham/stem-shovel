/**
 * The song page's address for one arrangement (docs/arrangements.md): the
 * page's own path and query with `arrangement` set to an alternate's id, or
 * left out for Main (null). Every other query parameter stays.
 */
export function arrangementHref(url: { href: string }, arrangementId: string | null): string {
	const next = new URL(url.href);
	if (arrangementId) next.searchParams.set("arrangement", arrangementId);
	else next.searchParams.delete("arrangement");
	return next.pathname + next.search;
}
