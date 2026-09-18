import { drizzle } from "drizzle-orm/libsql";
import { ENV } from "varlock/env";
import * as schema from "./schema";
import { libsqlUrl } from "$lib/utils/libsqlUrl";

export const db = drizzle({
	connection: { url: libsqlUrl(ENV.TURSO_DATABASE_URL), authToken: ENV.TURSO_AUTH_TOKEN },
	schema,
});

export { schema };
