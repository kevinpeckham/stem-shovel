import { MIDI_MAX_BYTES } from "$lib/constants/midiFormats";
import { accountOfStem, memberOf } from "$lib/server/access";
import { reserveStemMidi } from "$lib/server/data";
import { midiContentType } from "$lib/utils/midiContentType";
import { accessOfPathname } from "$lib/server/relocate";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of a MIDI upload for a stem: reserve the pathname to upload to. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { filename?: string; sizeBytes?: number };
	const { filename, sizeBytes } = body;
	if (!filename || typeof sizeBytes !== "number") error(400, "filename and sizeBytes are required");
	const contentType = midiContentType(filename);
	if (!contentType) error(415, `"${filename}" is not a MIDI file (.mid or .midi)`);
	if (sizeBytes > MIDI_MAX_BYTES) error(413, "MIDI file is over the size limit");
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	const row = await reserveStemMidi(accountId, params.id, { filename, contentType, sizeBytes });
	if (!row) error(404, "Stem not found");
	return json({
		stemId: row.stemId,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
