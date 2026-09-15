/**
 * Makes a user the operator of the app (user.is_system_admin), which opens
 * /admin: accounts, users and system invite codes that let someone sign up
 * for a workspace of their own.
 *
 *   bun run db:system-admin <email>
 *   bun run db:system-admin --remove <email>
 *
 * No import of src/lib/server (it pulls in $app/*), so the schema and a
 * direct libsql client are used, as in preview-bot.ts.
 */
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";

const db = drizzle({
	connection: { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! },
	schema,
});

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const [email] = args.filter((a) => a !== "--remove");
if (!email) throw new Error("usage: bun scripts/system-admin.ts [--remove] <email>");

const [row] = await db
	.update(schema.user)
	.set({ isSystemAdmin: !remove })
	.where(eq(schema.user.email, email.toLowerCase()))
	.returning({ name: schema.user.name });
if (!row) throw new Error(`no user with the address ${email}`);
console.log(`${row.name} is ${remove ? "no longer" : "now"} a system admin`);
