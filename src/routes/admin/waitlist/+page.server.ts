import { listWaitlist } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ entries: await listWaitlist() });
