/**
 * Saves a Blob the browser already holds under `filename`: an object URL on
 * a link clicked for the user, revoked a minute later. `saveAs` in
 * src/lib/upload.ts is for a file on a server (it fetches first); a blob
 * made in the page must not go through `fetch`, which the page's
 * Content Security Policy (vite.config.ts, `connect-src`) refuses for
 * `blob:` URLs.
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
