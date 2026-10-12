export type StemPlaybackMode = "buffered" | "streamed";
/** A listener's own choice for this browser, or auto. */
export type StemModeChoice = "auto" | StemPlaybackMode;
/** The site's setting (an admin's): streaming when a song needs it, or for every song. */
export type StemStreamingSetting = "auto" | "always";

/**
 * Which way to play a song (docs/stem-streaming.md, "Mode choice"): the
 * listener's own choice wins, then the site's "always", else streaming
 * when the decoded estimate passes the device's budget. Never streamed
 * where the browser cannot (no AudioDecoder, no worklet).
 */
export function stemPlaybackMode(o: {
	estimate: number;
	budget: number;
	choice: StemModeChoice | null;
	site: StemStreamingSetting;
	capable: boolean;
}): StemPlaybackMode {
	if (!o.capable) return "buffered";
	if (o.choice === "buffered" || o.choice === "streamed") return o.choice;
	if (o.site === "always") return "streamed";
	return o.estimate > o.budget ? "streamed" : "buffered";
}
