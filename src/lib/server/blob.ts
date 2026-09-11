import type { StemManifest } from "$lib/audio/types";
import { SLUG_PATTERN, STEM_PREFIX } from "$lib/slug";
import { del, list } from "@vercel/blob";
import { ENV } from "varlock/env";

/**
 * Songs are folders under `stems/` in the Blob store; each stem is one file.
 * There is no database yet (plan step 4 adds Turso), so a song's manifest is
 * derived from a Blob listing: title from the slug, label from the filename.
 *
 * The token is passed explicitly on every call. `@vercel/blob` otherwise
 * prefers OIDC when VERCEL_OIDC_TOKEN is in the environment, which fails in
 * development and is not what we want — the token comes from 1Password via
 * varlock, not from Vercel's env vars.
 */
const auth = () => ({ token: ENV.BLOB_READ_WRITE_TOKEN });

interface SongSummary {
	slug: string;
	title: string;
}

function titleFromSlug(slug: string): string {
	return slug.replace(/-+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Folder names directly under `stems/`, newest listing order is not guaranteed. */
export async function listSongs(): Promise<SongSummary[]> {
	const { folders } = await list({ prefix: STEM_PREFIX, mode: "folded", ...auth() });
	return folders
		.map((f) => f.slice(STEM_PREFIX.length).replace(/\/$/, ""))
		.filter((slug) => SLUG_PATTERN.test(slug))
		.sort()
		.map((slug) => ({ slug, title: titleFromSlug(slug) }));
}

/** Every stem file for one song, or null if the folder is empty / missing. */
export async function loadSong(slug: string): Promise<StemManifest | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const prefix = `${STEM_PREFIX}${slug}/`;
	const { blobs } = await list({ prefix, ...auth() });
	if (blobs.length === 0) return null;
	const stems = blobs
		.filter((b) => b.pathname.startsWith(prefix) && !b.pathname.slice(prefix.length).includes("/"))
		.sort((a, b) => a.pathname.localeCompare(b.pathname))
		.map((b) => ({
			id: b.pathname,
			label: b.pathname.slice(prefix.length).replace(/\.[^.]+$/, ""),
			url: b.url,
		}));
	return { title: titleFromSlug(slug), stems };
}

/** Removes every blob under the song's folder. */
export async function deleteSong(slug: string): Promise<number> {
	if (!SLUG_PATTERN.test(slug)) return 0;
	const { blobs } = await list({ prefix: `${STEM_PREFIX}${slug}/`, ...auth() });
	if (blobs.length > 0)
		await del(
			blobs.map((b) => b.url),
			auth(),
		);
	return blobs.length;
}
