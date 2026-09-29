import { publicBlobUrl } from "$lib/server/blob";
import type { PageServerLoad } from "./$types";

/** The piano page: where this stage keeps the Grand Piano's standard and hi-res sample tiers (scripts/piano-samples.ts). */
export const load: PageServerLoad = async () => ({ samplesBase: publicBlobUrl("piano/v1") });
