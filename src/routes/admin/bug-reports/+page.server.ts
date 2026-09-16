import { listBugReports } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
	reports: (await listBugReports()).filter((r) => r.kind !== "feature"),
});
