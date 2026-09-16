import { systemOverview } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ accounts: (await systemOverview()).accounts });
