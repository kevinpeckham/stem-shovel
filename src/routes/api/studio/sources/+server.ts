import { requireStudioAccess } from "#lib/server/access.js";
import { createStudioSource } from "#lib/server/data.js";
import { parseBody } from "#lib/server/parseJsonBody.js";
import { DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
import { MAX_STUDIO_SOURCES } from "#lib/constants/studio.js";
import { MAX_TAKE_BYTES } from "#lib/constants/takeLimits.js";
import { StudioSourceReserveSchema } from "#lib/val/StudioSchema.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { error } from "@sveltejs/kit";
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
	const body = (await request.json().catch(() => null)) as { sizeBytes?: unknown } | null;
	// Over the ceiling is 413 as on the other reserve routes; everything else the schema says.
	if (typeof body?.sizeBytes === "number" && body.sizeBytes > MAX_TAKE_BYTES)
		error(413, `A recording is at most ${Math.round(MAX_TAKE_BYTES / 1024 / 1024)} MB`);
	const reserve = parseBody(body, StudioSourceReserveSchema);
	// The song is the user's own idea (whichever account holds its files); its account's storage is what the source counts against.
	const { accountId, userId } = await requireStudioAccess(locals, reserve.ideaId);
	await requireStorageRoom(accountId, reserve.sizeBytes);
	const made = await createStudioSource(accountId, userId, reserve);
	if (made === null) error(404, "Song not found");
	if (typeof made === "string") error(...REFUSED[made]);
	return Response.json(made);
};
