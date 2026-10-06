/**
 * Notation files attached to a song (docs/uploads-and-blob.md, "Notation
 * files"): MusicXML, compressed (`.mxl`) or uncompressed (`.musicxml`,
 * `.xml`), rendered in the browser by Verovio.
 */
export const NOTATION_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_NOTATION_PER_SONG = 20;
/** The first page as a WebP the browser renders at upload (Verovio in a worker); a sane ceiling for what it sends back. */
export const NOTATION_THUMBNAIL_MAX_BYTES = 400 * 1024;
export const NOTATION_ACCEPT =
	".mxl,.musicxml,.xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/xml,text/xml";
export const NOTATION_EXTENSIONS = ["mxl", "musicxml", "xml"] as const;
export type NotationFormat = "mxl" | "musicxml";
/** The content types `/api/upload` accepts for a notation pathname: browsers label these files every which way. */
export const NOTATION_CONTENT_TYPES = [
	"application/vnd.recordare.musicxml+xml",
	"application/vnd.recordare.musicxml",
	"application/xml",
	"text/xml",
	"application/zip",
	"application/octet-stream",
];
/** The type the file is served as (`/f/<code>?download=1`) and uploaded with, by format. */
export const NOTATION_CONTENT_TYPE_OF: Record<NotationFormat, string> = {
	mxl: "application/vnd.recordare.musicxml",
	musicxml: "application/vnd.recordare.musicxml+xml",
};

/** The format a filename's extension promises (case-insensitive; `.xml` is taken as plain MusicXML), or null. */
export function notationFormatOf(filename: string): NotationFormat | null {
	const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	if (ext === "mxl") return "mxl";
	if (ext === "musicxml" || ext === "xml") return "musicxml";
	return null;
}
