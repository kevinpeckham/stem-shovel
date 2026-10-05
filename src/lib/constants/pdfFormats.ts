/** PDFs attached to a song (docs/uploads-and-blob.md, "PDFs"): charts, lead sheets, notation. */
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PDFS_PER_SONG = 20;
/** The first page as a WebP the browser renders at upload (utils/pdfThumbnail.ts); a sane ceiling for what it sends back. */
export const PDF_THUMBNAIL_MAX_BYTES = 400 * 1024;
export const PDF_THUMBNAIL_WIDTH = 400;
export const PDF_ACCEPT = ".pdf,application/pdf";
