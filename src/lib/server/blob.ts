import { del } from "@vercel/blob";
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

/** Deletes blobs by URL; ignores empty lists and blobs that are already gone. */
export async function deleteBlobs(urls: string[]): Promise<void> {
	const real = urls.filter((u) => u.startsWith("https://"));
	if (real.length > 0) await del(real, blobAuth());
}
