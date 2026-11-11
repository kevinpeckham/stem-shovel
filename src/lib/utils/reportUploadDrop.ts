import { looksLikeNetwork } from "./withRetries.js";

/** The kind of file from its Blob pathname, for the report's tag: never the pathname itself, which carries ids. */
const KINDS = [
	"demos",
	"mixes",
	"midi",
	"files",
	"notation",
	"sessions",
	"recordings",
	"studio",
	"kits",
	"chat",
];
const kindOf = (pathname: string) => KINDS.find((k) => pathname.includes(`/${k}/`)) ?? "stems";

/**
 * Tells Sentry that a transfer to Blob got no answer from the network
 * (docs/uploads-and-blob.md, "Retries"): a dropped connection, or the TLS
 * record Chrome refuses now and then (`net::ERR_SSL_BAD_RECORD_MAC_ALERT`),
 * which the page cannot tell apart, since `fetch` says only "Failed to
 * fetch". The upload code catches these to retry and to show its own
 * message, so without this nothing reached Sentry and the only sign was a
 * member saying so. One issue for all of them (the fingerprint), a warning
 * for an attempt that will be retried and an error for the last one, tagged
 * with the kind of file and the attempt, so the issue's counts say how often
 * transfers drop, how often a retry saves them, and in which browsers. An
 * answer from the server (a refused type, a 4xx) is not a drop and is not
 * reported here. The import is lazy so tests and SSR never load Sentry.
 */
export async function reportUploadDrop(
	error: unknown,
	pathname: string,
	attempt: number,
	last: boolean,
): Promise<void> {
	if (!looksLikeNetwork(error)) return;
	try {
		const Sentry = await import("@sentry/sveltekit");
		Sentry.captureMessage("An upload's transfer was dropped by the network", {
			level: last ? "error" : "warning",
			fingerprint: ["upload-transfer-dropped"],
			tags: {
				"upload.kind": kindOf(pathname),
				"upload.attempt": String(attempt + 1),
				"upload.outcome": last ? "failed" : "retried",
			},
			extra: { error: error instanceof Error ? error.message : String(error) },
		});
	} catch {
		// no Sentry here
	}
}
