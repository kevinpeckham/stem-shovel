import { listAiRequests } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ aiRequests: await listAiRequests() });
