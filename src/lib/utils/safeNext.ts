/**
 * A `?next=` target we will send someone to after sign-in: a path on this
 * site only. `//evil.example` and `/\evil.example` are protocol-relative
 * URLs, which browsers follow off-site, so they are refused along with
 * anything absolute.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
	if (!next || !next.startsWith("/")) return fallback;
	if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
	return next;
}
