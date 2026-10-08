import { listAiRequests } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ aiRequests: await listAiRequests() });
