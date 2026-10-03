import { isEditor, memberOf, requireSystemAdmin, requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import { accountOfDrumKit, createDrumSample, storageRoom } from "$lib/server/data";
import { checkStorage } from "$lib/server/notifications";
import { recordingAccess } from "$lib/server/blob";
import { DEMO_FORMAT_LIST } from "$lib/constants/demoFormats";
import { DRUM_SAMPLE_MAX_BYTES } from "$lib/constants/drumKits";
import { DRUM_VOICE_IDS, type DrumVoiceId } from "$lib/constants/drumMachine";
import { demoContentType } from "$lib/utils/demoContentType";
import { formatBytes } from "$lib/utils/formatBytes";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 1 of a drum sample upload (docs/drum-machine.md, "Custom kits"):
 * reserve the row for one voice of a kit and answer with the pathname to
 * upload to. An account kit's sample counts against the account's storage
 * and wants an editor; a site kit's wants a system admin.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		kitId?: string;
		voice?: string;
		filename?: string;
		sizeBytes?: number;
	};
	const { kitId, voice, filename, sizeBytes } = body;
	if (!kitId || !voice || !filename || typeof sizeBytes !== "number") {
		error(400, "kitId, voice, filename and sizeBytes are required");
	}
	if (!DRUM_VOICE_IDS.includes(voice as DrumVoiceId)) error(400, `"${voice}" is not a drum voice`);
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (sizeBytes > DRUM_SAMPLE_MAX_BYTES)
		error(413, `A sample is at most ${formatBytes(DRUM_SAMPLE_MAX_BYTES)}`);
	const kit = await accountOfDrumKit(kitId);
	if (!kit) error(404, "Kit not found");
	const user = requireUser(locals);
	if (kit.accountId) {
		const m = await memberOf(locals, async () => kit.accountId, kit.accountId);
		if (!isEditor(m.role)) error(404, "Kit not found");
		const room = await storageRoom(kit.accountId, sizeBytes);
		if (!room.ok) {
			error(
				409,
				`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
			);
		}
		background(() => checkStorage(kit.accountId!));
	} else requireSystemAdmin(locals);
	const row = await createDrumSample(kit.accountId, user.id, kitId, voice as DrumVoiceId, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Kit not found");
	return json({
		sampleId: row.id,
		pathname: row.pathname,
		access: kit.accountId ? recordingAccess() : "public",
	});
};
