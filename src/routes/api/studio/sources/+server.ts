import { requireOwnIdea } from "$lib/server/access";
import { background } from "$lib/server/background";
import { createStudioSource, storageRoom } from "$lib/server/data";
import { checkStorage } from "$lib/server/notifications";
import { parseJsonBody } from "$lib/server/parseJsonBody";
import { DEMO_FORMAT_LIST } from "$lib/constants/demoFormats";
import { MAX_STUDIO_SOURCES } from "$lib/constants/studio";
import { formatBytes } from "$lib/utils/formatBytes";
import { StudioSourceReserveSchema } from "$lib/val/StudioSchema";
import type { Config } from "@sveltejs/adapter-vercel";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const config: Config = { maxDuration: 60 };

/** Why a reservation was refused, as the browser should hear it. */
const REFUSED: Record<"full" | "exists" | "unsupported", [number, string]> = {
	full: [409, `A song holds at most ${MAX_STUDIO_SOURCES} audio files`],
	exists: [409, "A source with that id already exists"],
	unsupported: [415, `That is not a supported audio format (${DEMO_FORMAT_LIST})`],
};

/** Step 1 of saving a Studio source (docs/multitrack-recorder.md, "Data model"): reserve the row under its song and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const reserve = await parseJsonBody(request, StudioSourceReserveSchema);
	// The song is the user's own idea (whichever account holds its files); its account's storage is what the source counts against.
	const { accountId, userId } = await requireOwnIdea(locals, reserve.ideaId);
	const room = await storageRoom(accountId, reserve.sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	// The reservation may have crossed a warning line; the account's admins hear after the response.
	background(() => checkStorage(accountId));
	const made = await createStudioSource(accountId, userId, reserve);
	if (made === null) error(404, "Song not found");
	if (typeof made === "string") error(...REFUSED[made]);
	return json(made);
};
