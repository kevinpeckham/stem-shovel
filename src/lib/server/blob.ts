import { accessOfUrl, type BlobAccess, blobPathname } from "$lib/utils/blobAccess";
import { del, get, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { ENV } from "varlock/env";

/**
 * Two stores: the public one every file used to live in, and a private one
 * for the files of private songs (docs/auth.md, privacy). A file's URL says
 * which (src/lib/utils/blobAccess.ts). The token is passed explicitly on
 * every `@vercel/blob` call: left to its defaults the SDK prefers OIDC
 * whenever VERCEL_OIDC_TOKEN is present (it is, in .env.local), and that
 * fails in development. Tokens come from 1Password via varlock.
 */
export function blobAuth(access: BlobAccess = "public") {
	if (access === "private") {
		if (!ENV.BLOB_PRIVATE_READ_WRITE_TOKEN)
			throw new Error("BLOB_PRIVATE_READ_WRITE_TOKEN is not configured");
		return { token: cleanToken(ENV.BLOB_PRIVATE_READ_WRITE_TOKEN) };
	}
	return { token: cleanToken(ENV.BLOB_READ_WRITE_TOKEN) };
}

/** A token pasted into 1Password with quotes or whitespace around it is still the token. */
const cleanToken = (t: string) => t.trim().replace(/^["']+|["']+$/g, "");

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

/** Blob pathname for a stem's MIDI file; the stamp keeps every upload a new URL. */
export function midiPathname(accountId: string, songId: string, stemId: string, filename: string) {
	const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "mid").toLowerCase();
	return `accounts/${accountId}/songs/${songId}/midi/${stemId}-${Date.now().toString(36)}.${ext}`;
}

/** Blob pathname for a demo recording, under the song like its stems. */
export function demoPathname(accountId: string, songId: string, demoId: string, filename: string) {
	const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
	return `accounts/${accountId}/songs/${songId}/demos/${demoId}.${ext}`;
}

/** Blob pathname for a scratch recording: under the account, not a song (docs/demo-recording.md). */
export function recordingPathname(accountId: string, recordingId: string, filename: string) {
	const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
	return `accounts/${accountId}/recordings/${recordingId}.${ext}`;
}

/** True for a recording's pathname (the upload handler and access checks route on it). */
export const isRecordingPathname = (pathname: string) => pathname.includes("/recordings/");

/**
 * Scratch recordings are members-only, so they go to the private store when
 * one is configured; without it they live in the public store like everything
 * else did before privacy (the pathname carries an unguessable id).
 */
export function recordingAccess(): BlobAccess {
	return ENV.BLOB_PRIVATE_READ_WRITE_TOKEN ? "private" : "public";
}

/**
 * Copies a file to a new pathname in the given store (adding a recording to a
 * song as a demo). Streams like `moveBlob`; the source stays.
 */
export async function copyBlob(url: string, toPathname: string, to: BlobAccess): Promise<string> {
	const res = await readBlob(url);
	if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} reading ${url}`);
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	const copied = await putBlob(toPathname, res.body, contentType, to);
	return copied.url;
}

/** Hostnames of our two stores: `store_1K3OTzJ…` → `1k3otzj….public.blob.vercel-storage.com`. */
function storeHosts(): string[] {
	const host = (id: string | undefined, access: BlobAccess) =>
		id ? `${id.replace(/^store_/, "").toLowerCase()}.${access}.blob.vercel-storage.com` : null;
	return [host(ENV.BLOB_STORE_ID, "public"), host(ENV.BLOB_PRIVATE_STORE_ID, "private")].filter(
		(h): h is string => !!h,
	);
}

/**
 * True for a URL in one of our stores — and, when a pathname is given, for
 * exactly that file. Browsers report the URL of what they uploaded; without
 * this check a member could store any address and the server would fetch
 * it when transcoding or mixing.
 */
export function isOurBlobUrl(url: string, pathname?: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "https:" || !storeHosts().includes(parsed.hostname)) return false;
	return pathname === undefined || blobPathname(url) === pathname;
}

/** The song id inside any upload pathname (`accounts/<a>/songs/<s>/…`), or null. */
export function songIdOfPathname(pathname: string): string | null {
	return pathname.match(/^accounts\/[^/]+\/songs\/([^/]+)\//)?.[1] ?? null;
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
/** Blob pathname for an account's, artist's or project's picture; stamped, since a new image must get a new URL. */
export function imagePathname(
	kind: "account" | "artist" | "project",
	accountId: string,
	id: string,
	ext: string,
) {
	const stamp = Date.now().toString(36);
	if (kind === "account") return `accounts/${accountId}/image-${stamp}.${ext}`;
	return `accounts/${accountId}/${kind}s/${id}/image-${stamp}.${ext}`;
}

export function mixPathname(accountId: string, songId: string, key: string) {
	return `accounts/${accountId}/songs/${songId}/mix-${key}-${Date.now().toString(36)}.mp3`;
}

/** Uploads a server-side file (a rendition, a mix) into the given store with the same long cache as browser uploads. */
export async function putBlob(
	pathname: string,
	body: Buffer | ReadableStream,
	contentType: string,
	access: BlobAccess = "public",
) {
	return put(pathname, body, {
		access,
		contentType,
		addRandomSuffix: false,
		allowOverwrite: true,
		cacheControlMaxAge: 60 * 60 * 24 * 30,
		...blobAuth(access),
	});
}

/** Deletes blobs by URL from whichever store each is in; ignores empty lists and blobs already gone. */
export async function deleteBlobs(urls: string[]): Promise<void> {
	const real = urls.filter((u) => u.startsWith("https://"));
	for (const access of ["public", "private"] as const) {
		const mine = real.filter((u) => accessOfUrl(u) === access);
		if (mine.length > 0) await del(mine, blobAuth(access));
	}
}

/**
 * Reads a file the server needs (to transcode, mix, or move): a plain fetch
 * for the public store, an authenticated `get` for the private one. Returns
 * a Response either way so callers stream or buffer as they like.
 */
export async function readBlob(url: string): Promise<Response> {
	if (!isOurBlobUrl(url)) throw new Error(`refusing to read a file outside our stores: ${url}`);
	if (accessOfUrl(url) === "public") return fetch(url);
	// Straight from origin: the CDN can lag a file written moments ago (a fresh
	// upload about to be transcoded, a mix about to be moved).
	const found = await get(url, { access: "private", useCache: false, ...blobAuth("private") });
	if (!found) return new Response(null, { status: 404, statusText: "Not Found" });
	return new Response(found.stream, {
		status: 200,
		headers: { "content-type": found.blob.contentType ?? "application/octet-stream" },
	});
}

/** How long a presigned URL handed to a page stays good. Long enough to finish listening and downloading. */
const PRESIGN_TTL_MS = 12 * 60 * 60 * 1000;

let delegation: { token: Awaited<ReturnType<typeof issueSignedToken>>; validUntil: number } | null =
	null;

/** One whole-store read delegation, reused until it nears expiry; presigning each URL is then local. */
async function readDelegation() {
	const now = Date.now();
	if (delegation && delegation.validUntil - now > 60 * 60 * 1000) return delegation.token;
	const validUntil = now + PRESIGN_TTL_MS + 60 * 60 * 1000;
	const token = await issueSignedToken({
		pathname: "*",
		operations: ["get", "head"],
		validUntil,
		...blobAuth("private"),
	});
	delegation = { token, validUntil };
	return token;
}

/**
 * The URL a browser may use: a public file's own URL, or a presigned one for
 * a private file (valid PRESIGN_TTL_MS). Pages call this on every file URL
 * they hand to the player, the demo player or the download buttons.
 */
export async function presentUrl(
	url: string | null | undefined,
	operation: "get" | "head" = "get",
): Promise<string | null> {
	if (!url) return url ?? null;
	if (accessOfUrl(url) === "public") return url;
	// A URL signed for GET is not valid for HEAD (and vice versa): sign for the method used.
	const { presignedUrl } = await presignUrl(await readDelegation(), {
		operation,
		pathname: blobPathname(url),
		access: "private",
		validUntil: Date.now() + PRESIGN_TTL_MS,
	});
	return presignedUrl;
}

/**
 * Moves a file to the other store (same pathname), returning its new URL.
 * Streams, so a 500 MB stem never sits in memory; the old copy is deleted
 * once the new one is in place.
 */
export async function moveBlob(url: string, to: BlobAccess): Promise<string> {
	if (accessOfUrl(url) === to) return url;
	const res = await readBlob(url);
	if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} reading ${url}`);
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	// A fresh pathname each move: the CDN remembers a deleted pathname as gone
	// for a while, so moving back onto the old one would answer 404 at first.
	const moved = await putBlob(movedPathname(blobPathname(url)), res.body, contentType, to);
	// The CDN can lag a fresh put by a moment; keep the old copy until the new
	// one answers, so a page that loads mid-move never points at nothing.
	await untilReadable(moved.url);
	await deleteBlobs([url]);
	return moved.url;
}

async function untilReadable(url: string, tries = 8): Promise<void> {
	for (let i = 0; i < tries; i++) {
		const fetchable = (await presentUrl(url, "head")) ?? url;
		const res = await fetch(fetchable, { method: "HEAD" }).catch(() => null);
		if (res?.ok) return;
		await new Promise((r) => setTimeout(r, 1500));
	}
	throw new Error(`moved file did not become readable: ${url}`);
}

/** `…/stem.wav` → `…/stem.m<stamp>.wav`; an earlier stamp is replaced, not stacked. */
export function movedPathname(pathname: string) {
	const stamp = `m${Date.now().toString(36)}`;
	return pathname.replace(/(\.m[a-z0-9]+)?(\.[a-z0-9]+)$/i, `.${stamp}$2`);
}
