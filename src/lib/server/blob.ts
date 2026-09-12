import { del, put } from "@vercel/blob";
import { ENV } from "varlock/env";

/**
 * The token is passed explicitly on every `@vercel/blob` call. Left to its
 * defaults the SDK prefers OIDC whenever VERCEL_OIDC_TOKEN is present (it is,
 * in .env.local), and that fails in development. The token comes from
 * 1Password via varlock, not from Vercel's env vars.
 */
export const blobAuth = () => ({ token: ENV.BLOB_READ_WRITE_TOKEN });

/**
 * Blob pathname for a stem. IDs, not slugs, so renames never move files.
 * `version` is appended for replacements: Blob serves files with a 30-day
 * cache header, so a new file must get a new URL or browsers keep the old one.
 */
export function stemPathname(
	accountId: string,
	songId: string,
	stemId: string,
	filename: string,
	version = 0,
) {
	const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
	const name = version > 0 ? `${stemId}-v${version}` : stemId;
	return `accounts/${accountId}/songs/${songId}/${name}.${ext}`;
}

/**
 * Pathname of a stem's playback rendition, next to its source. The stamp
 * makes every render a new URL (same 30-day cache reason as `version`).
 */
export function playbackPathname(sourcePathname: string) {
	const base = sourcePathname.replace(/\.[a-z0-9]+$/i, "");
	return `${base}.play-${Date.now().toString(36)}.m4a`;
}

/** Pathname of a song's cached original mixdown; `key` identifies the stem files mixed, the stamp keeps every render a new blob. */
export function mixPathname(accountId: string, songId: string, key: string) {
	return `accounts/${accountId}/songs/${songId}/mix-${key}-${Date.now().toString(36)}.mp3`;
}

/** Uploads a server-side file (a rendition) with the same long cache as browser uploads. */
export async function putBlob(pathname: string, body: Buffer, contentType: string) {
	return put(pathname, body, {
		access: "public",
		contentType,
		addRandomSuffix: false,
		cacheControlMaxAge: 60 * 60 * 24 * 30,
		...blobAuth(),
	});
}

/** Deletes blobs by URL; ignores empty lists and blobs that are already gone. */
export async function deleteBlobs(urls: string[]): Promise<void> {
	const real = urls.filter((u) => u.startsWith("https://"));
	if (real.length > 0) await del(real, blobAuth());
}
