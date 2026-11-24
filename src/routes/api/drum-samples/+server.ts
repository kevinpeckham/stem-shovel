import { isEditor, memberOf, requireSystemAdmin, requireUser } from "#lib/server/access.js";
import { accountOfDrumKit, createDrumSample, ensureBuiltinKitRow } from "#lib/server/data.js";
import { recordingAccess } from "#lib/server/blob.js";
import { DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
import {
	DRUM_KIT_LAYERS,
	DRUM_SAMPLE_MAX_BYTES,
	isOverridableKit,
	MAX_DRUM_ROUND_ROBINS,
	type DrumKitLayer,
} from "#lib/constants/drumKits.js";
import { DRUM_VOICE_IDS, type DrumVoiceId } from "#lib/constants/drumMachine.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 1 of a drum sample upload (docs/drum-machine.md, "Custom kits"):
 * reserve the row for one voice of a kit and answer with the pathname to
 * upload to. An account kit's sample counts against the account's storage
 * and wants an editor; a site kit's wants a system admin.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Sign-in first: an unknown kit id answers a stranger nothing at all.
	const user = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as {
		kitId?: string;
		voice?: string;
		filename?: string;
		sizeBytes?: number;
		layer?: number;
		loudness?: number | null;
	};
	const { kitId, voice, filename, sizeBytes, layer, loudness } = body;
	if (!kitId || !voice || !filename || typeof sizeBytes !== "number") {
		error(400, "kitId, voice, filename and sizeBytes are required");
	}
	// A multisampled kit's file (docs/drum-machine.md, "Multisampled kits"): its velocity layer, and its loudness as the browser measured it.
	if (layer !== undefined && !(DRUM_KIT_LAYERS as readonly number[]).includes(layer))
		error(400, "layer must be 1 to 5");
	if (
		loudness !== undefined &&
		loudness !== null &&
		(typeof loudness !== "number" || !Number.isFinite(loudness) || loudness < -120 || loudness > 20)
	)
		error(400, "loudness must be a LUFS value");
	if (!DRUM_VOICE_IDS.includes(voice as DrumVoiceId)) error(400, `"${voice}" is not a drum voice`);
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, DRUM_SAMPLE_MAX_BYTES)) {
		if (sizeBytes > DRUM_SAMPLE_MAX_BYTES)
			error(413, `A sample is at most ${formatBytes(DRUM_SAMPLE_MAX_BYTES)}`);
		error(400, "sizeBytes must be the file's size in whole bytes");
	}
	// A built-in kit's drum (docs/drum-machine.md, "Custom kits"): a system admin's replacement, the kit's row made on the first.
	if (isOverridableKit(kitId)) {
		requireSystemAdmin(locals);
		await ensureBuiltinKitRow(kitId);
	}
	const kit = await accountOfDrumKit(kitId);
	if (!kit) error(404, "Kit not found");
	if (kit.accountId) {
		const m = await memberOf(locals, async () => kit.accountId, kit.accountId);
		if (!isEditor(m.role)) error(404, "Kit not found");
		await requireStorageRoom(kit.accountId, sizeBytes);
	} else requireSystemAdmin(locals);
	const row = await createDrumSample(
		kit.accountId,
		user.id,
		kitId,
		voice as DrumVoiceId,
		{ filename, contentType, sizeBytes },
		{ layer: layer as DrumKitLayer | undefined, loudness: loudness ?? null },
	);
	if (!row) error(404, "Kit not found");
	if (row === "no-top-layer") error(409, "A drum needs a layer 5 sample before any lower layer");
	if (row === "layer-full")
		error(409, `A layer holds at most ${MAX_DRUM_ROUND_ROBINS} round-robin samples`);
	if (row === "not-multisampled") error(400, "Only a multisampled kit has velocity layers");
	return Response.json({
		sampleId: row.id,
		pathname: row.pathname,
		access: kit.accountId ? recordingAccess() : "public",
		// Where it landed: a multisampled kit's round robin, and the name it was given for it.
		layer: row.layer,
		rr: row.rr,
		filename: row.filename,
	});
};
