import { listDrumKitsFor } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The site's drum kits (docs/drum-machine.md, "Custom kits"): the layout already gates the area to system admins. */
export const load: PageServerLoad = async () => {
	return { kits: await listDrumKitsFor(null) };
};
