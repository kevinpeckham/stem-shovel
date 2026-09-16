/**
 * Which Vercel Blob store a file lives in is written into its URL:
 * `https://<store>.public.blob.vercel-storage.com/<pathname>` or
 * `…<store>.private.blob.vercel-storage.com/…`. Public files are fetched as
 * they are; private ones need a presigned URL (src/lib/server/blob.ts).
 */
export type BlobAccess = "public" | "private";

export function accessOfUrl(url: string): BlobAccess {
	return /^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//i.test(url) ? "private" : "public";
}

export const isPrivateBlobUrl = (url: string) => accessOfUrl(url) === "private";

/** The blob's pathname (what `put` was given), from its URL; empty for anything else. */
export function blobPathname(url: string): string {
	const m = url.match(/^https:\/\/[^/]+\.blob\.vercel-storage\.com\/([^?#]+)/i);
	return m ? decodeURIComponent(m[1]) : "";
}
