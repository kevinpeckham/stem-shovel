import { listSupportRequests } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ requests: await listSupportRequests() });
