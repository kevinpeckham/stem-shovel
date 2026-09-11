import { drizzle } from "drizzle-orm/libsql";
import { ENV } from "varlock/env";
import * as schema from "./schema";

export const db = drizzle({
	connection: { url: ENV.TURSO_DATABASE_URL, authToken: ENV.TURSO_AUTH_TOKEN },
	schema,
});

export { schema };
