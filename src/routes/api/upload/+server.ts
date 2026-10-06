import {
	accountOfUploadPathname,
	isEditor,
	memberOf,
	requireSystemAdmin,
	requireUser,
} from "$lib/server/access";
import {
	findStemByMidiPathname,
	findUploadingDemo,
	findUploadingFile,
	recordFileUrl,
	findUploadingNotation,
	recordNotationUrl,
	findUploadingRecording,
	findUploadingRecordingStem,
	findUploadingStem,
	accountOfDrumSamplePathname,
	findUploadingDrumSample,
	recordDrumSampleUrl,
	recordDemoUrl,
	recordRecordingUrl,
	recordStemMidiUrl,
	recordStemUrl,
	recordingOfPathname,
	userOwnsRecording,
} from "$lib/server/data";
import {
	blobAuth,
	isDrumSamplePathname,
	isFilePathname,
	isNotationPathname,
	isRecordingPathname,
	isSiteKitPathname,
	recordingAccess,
	songIdOfPathname,
} from "$lib/server/blob";
import { DRUM_SAMPLE_MAX_BYTES } from "$lib/constants/drumKits";
import { accessOfSongId } from "$lib/server/relocate";
import { MIDI_MAX_BYTES } from "$lib/constants/midiFormats";
import { FILE_CONTENT_TYPES, FILE_MAX_BYTES } from "$lib/constants/fileFormats";
import { NOTATION_CONTENT_TYPES, NOTATION_MAX_BYTES } from "$lib/constants/notationFormats";
import { STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { MAX_TAKE_BYTES } from "$lib/constants/takeLimits";
import { error, json } from "@sveltejs/kit";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { RequestHandler } from "./$types";

/**
 * Step 2 of an upload, per https://vercel.com/docs/vercel-blob/client-upload.
 * The browser calls `upload()` with this route as `handleUploadUrl`; we only
 * issue a token for a pathname that /api/stems reserved for this account.
 *
 * Authorization is "whoever locals says you are" until real auth exists.
 */
const isDemo = (pathname: string) => pathname.includes("/demos/");
const isMidi = (pathname: string) => pathname.includes("/midi/");

/** The account of a take's reserved pathname when the caller recorded it (ideas are the user's own), else 404. */
async function ownRecordingAccount(locals: App.Locals, pathname: string) {
	const user = requireUser(locals);
	const rec = await recordingOfPathname(pathname);
	if (!rec || !(await userOwnsRecording(rec.accountId, user.id, rec.id)))
		error(404, "Recording not found");
	return rec.accountId;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as HandleUploadBody;
	try {
		// The store (and so the token) follows the song's privacy; the pathname names the song.
		const pathname =
			body.type === "blob.generate-client-token"
				? body.payload.pathname
				: body.payload.blob.pathname;
		const songId = songIdOfPathname(pathname);
		// A scratch recording has no song: it goes to the private store when there is one; so does an account kit's sample, a site kit's to the public store.
		const access = isDrumSamplePathname(pathname)
			? isSiteKitPathname(pathname)
				? "public"
				: recordingAccess()
			: isRecordingPathname(pathname)
				? recordingAccess()
				: (songId && (await accessOfSongId(songId))) || "public";
		const result = await handleUpload({
			body,
			request,
			...blobAuth(access),
			onBeforeGenerateToken: async (pathname) => {
				// A custom kit's sample (docs/drum-machine.md, "Custom kits"): a system admin for a site kit, an editor of the account for its own.
				if (isDrumSamplePathname(pathname)) {
					if (isSiteKitPathname(pathname)) requireSystemAdmin(locals);
					else {
						const accountId = await accountOfDrumSamplePathname(pathname);
						if (!accountId) throw new Error(`No reservation for "${pathname}"`);
						const m = await memberOf(locals, async () => accountId, accountId);
						if (!isEditor(m.role)) throw new Error("Not an editor");
					}
					const row = await findUploadingDrumSample(pathname);
					if (!row) throw new Error(`No reservation for "${pathname}"`);
					return {
						allowedContentTypes: [row.contentType],
						maximumSizeInBytes: DRUM_SAMPLE_MAX_BYTES,
						addRandomSuffix: false,
						allowOverwrite: true,
						tokenPayload: JSON.stringify({ id: row.id }),
					};
				}
				// A take is the user's own, whichever account holds its files; everything else needs membership of the song's account.
				const accountId = isRecordingPathname(pathname)
					? await ownRecordingAccount(locals, pathname)
					: (await memberOf(locals, accountOfUploadPathname, pathname)).accountId;
				// A file attached to a song (docs/uploads-and-blob.md, "Attachments"): the types browsers label these files with, the ceiling of the reserved row's kind; the bytes are checked at ready.
				if (isFilePathname(pathname)) {
					const file = await findUploadingFile(accountId, pathname);
					if (!file) throw new Error(`No reservation for "${pathname}"`);
					return {
						allowedContentTypes: FILE_CONTENT_TYPES,
						maximumSizeInBytes: FILE_MAX_BYTES[file.kind],
						addRandomSuffix: false,
						allowOverwrite: true,
						tokenPayload: JSON.stringify({ id: file.id }),
					};
				}
				// A notation file (docs/uploads-and-blob.md, "Notation files"): the types browsers call MusicXML, its own ceiling; the bytes are checked at ready.
				if (isNotationPathname(pathname)) {
					const notation = await findUploadingNotation(accountId, pathname);
					if (!notation) throw new Error(`No reservation for "${pathname}"`);
					return {
						allowedContentTypes: NOTATION_CONTENT_TYPES,
						maximumSizeInBytes: NOTATION_MAX_BYTES,
						addRandomSuffix: false,
						allowOverwrite: true,
						tokenPayload: JSON.stringify({ id: notation.id }),
					};
				}
				// Stems and demo recordings share this route; the reservation decides which.
				const row = isMidi(pathname)
					? await findStemByMidiPathname(accountId, pathname)
					: isDemo(pathname)
						? await findUploadingDemo(accountId, pathname)
						: isRecordingPathname(pathname)
							? ((await findUploadingRecording(accountId, pathname)) ??
								(await findUploadingRecordingStem(accountId, pathname)))
							: await findUploadingStem(accountId, pathname);
				if (!row) throw new Error(`No reservation for "${pathname}"`);
				return {
					// decided from the extension at reserve time; MIDI is always audio/midi
					allowedContentTypes: ["contentType" in row ? row.contentType : "audio/midi"],
					maximumSizeInBytes: isMidi(pathname)
						? MIDI_MAX_BYTES
						: isRecordingPathname(pathname)
							? MAX_TAKE_BYTES
							: STEM_MAX_BYTES,
					addRandomSuffix: false,
					allowOverwrite: true, // a retry of the same reservation replaces the partial blob
					tokenPayload: JSON.stringify({ id: row.id }),
				};
			},
			onUploadCompleted: async ({ blob }) => {
				// Vercel calls this after the browser finishes — in production only,
				// it cannot reach localhost. The browser normally reports first via
				// /api/stems/[id]/ready; this is the backstop if that never arrives.
				if (isDrumSamplePathname(blob.pathname)) await recordDrumSampleUrl(blob.pathname, blob.url);
				else if (isMidi(blob.pathname)) await recordStemMidiUrl(blob.pathname, blob.url);
				else if (isDemo(blob.pathname)) await recordDemoUrl(blob.pathname, blob.url);
				else if (isFilePathname(blob.pathname)) await recordFileUrl(blob.pathname, blob.url);
				else if (isNotationPathname(blob.pathname))
					await recordNotationUrl(blob.pathname, blob.url);
				else if (isRecordingPathname(blob.pathname))
					await recordRecordingUrl(blob.pathname, blob.url);
				else await recordStemUrl(blob.pathname, blob.url);
			},
		});
		return json(result);
	} catch (err) {
		// 400 so Vercel's completion webhook retries are not triggered for our own errors.
		return json({ error: (err as Error).message }, { status: 400 });
	}
};
