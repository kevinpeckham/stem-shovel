import { listAuditLog } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ auditLog: await listAuditLog() });
