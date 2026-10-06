/**
 * A `Content-Disposition` for a download under the file's own name: an ASCII
 * stand-in in `filename` for old clients, the real name UTF-8 encoded in
 * `filename*` (RFC 6266), quotes and control characters kept out.
 */
export function attachmentDisposition(filename: string): string {
	const clean = filename.replace(/[\r\n"\\]/g, "_").trim() || "download";
	// eslint-disable-next-line no-control-regex
	const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
