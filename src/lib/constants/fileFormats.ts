/**
 * Files attached to a song (docs/uploads-and-blob.md, "Attachments"): a
 * chart as a PDF, a photo of a whiteboard, a reference mix, a text note, a
 * MIDI file, or anything else worth keeping with the song. The kind is
 * decided from the filename's extension (the content type a browser sends
 * is a claim; the server checks the stored bytes by kind at ready) and
 * decides the size ceiling, the signature check and how the page shows it.
 */
export const FILE_KINDS = ["pdf", "image", "audio", "text", "midi", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Extension → kind and content type. Anything else is "other", `application/octet-stream`. */
const EXTENSIONS: Record<string, { kind: FileKind; type: string }> = {
	pdf: { kind: "pdf", type: "application/pdf" },
	png: { kind: "image", type: "image/png" },
	jpg: { kind: "image", type: "image/jpeg" },
	jpeg: { kind: "image", type: "image/jpeg" },
	webp: { kind: "image", type: "image/webp" },
	gif: { kind: "image", type: "image/gif" },
	mp3: { kind: "audio", type: "audio/mpeg" },
	wav: { kind: "audio", type: "audio/wav" },
	m4a: { kind: "audio", type: "audio/mp4" },
	aac: { kind: "audio", type: "audio/aac" },
	ogg: { kind: "audio", type: "audio/ogg" },
	flac: { kind: "audio", type: "audio/flac" },
	aiff: { kind: "audio", type: "audio/aiff" },
	aif: { kind: "audio", type: "audio/aiff" },
	txt: { kind: "text", type: "text/plain" },
	md: { kind: "text", type: "text/markdown" },
	markdown: { kind: "text", type: "text/markdown" },
	mid: { kind: "midi", type: "audio/midi" },
	midi: { kind: "midi", type: "audio/midi" },
};

const extensionOf = (filename: string) =>
	filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";

/**
 * The kind of a file by its extension first; a content type only breaks a
 * tie for a name without a known extension (a browser's `image/*` or
 * `audio/*` for a file named oddly). Anything else is "other".
 */
export function fileKindOf(filename: string, contentType?: string): FileKind {
	const known = EXTENSIONS[extensionOf(filename)];
	if (known) return known.kind;
	const type = (contentType ?? "").toLowerCase();
	if (type === "application/pdf") return "pdf";
	if (type.startsWith("image/")) return "image";
	if (type === "audio/midi" || type === "audio/mid" || type === "audio/x-midi") return "midi";
	if (type.startsWith("audio/")) return "audio";
	if (type.startsWith("text/")) return "text";
	return "other";
}

/** The content type to store and serve a file as, from its extension. */
export const FILE_CONTENT_TYPE_OF = (filename: string): string =>
	EXTENSIONS[extensionOf(filename)]?.type ?? "application/octet-stream";

/** Per-file ceilings by kind (the browser checks before uploading; the token and the ready route enforce). */
export const FILE_MAX_BYTES: Record<FileKind, number> = {
	pdf: 25 * 1024 * 1024,
	image: 15 * 1024 * 1024,
	audio: 60 * 1024 * 1024,
	text: 2 * 1024 * 1024,
	midi: 2 * 1024 * 1024,
	other: 25 * 1024 * 1024,
};
export const MAX_FILES_PER_SONG = 40;

/** What the file picker offers: the known extensions and their types. */
export const FILE_ACCEPT = [
	...Object.keys(EXTENSIONS).map((ext) => `.${ext}`),
	...new Set(Object.values(EXTENSIONS).map((e) => e.type)),
].join(",");

/**
 * The content types `/api/upload` lets a browser label an attachment with:
 * every type above, the aliases browsers use for the same files, and the
 * generic one for anything else. The bytes decide at ready, not the label.
 */
export const FILE_CONTENT_TYPES: string[] = [
	...new Set(Object.values(EXTENSIONS).map((e) => e.type)),
	"image/jpg",
	"audio/x-wav",
	"audio/wave",
	"audio/x-m4a",
	"audio/x-aiff",
	"audio/x-flac",
	"audio/mp3",
	"audio/x-mpeg",
	"audio/aacp",
	"audio/x-aac",
	"audio/vorbis",
	"application/ogg",
	"audio/mid",
	"audio/x-midi",
	"text/x-markdown",
	"application/octet-stream",
];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
	pdf: "PDF",
	image: "Image",
	audio: "Audio",
	text: "Text",
	midi: "MIDI",
	other: "File",
};

/** The first page of a PDF as a WebP the browser renders at upload (utils/pdfThumbnail.ts); a sane ceiling for what it sends back. */
export const PDF_THUMBNAIL_MAX_BYTES = 400 * 1024;
export const PDF_THUMBNAIL_WIDTH = 400;
