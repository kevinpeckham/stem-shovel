/**
 * Makes a user a super admin (user.is_super_admin): inside any account they
 * do not belong to they count as its owner, every such use is written to
 * audit_log, and the header says "acting as owner". Separate from the
 * system-admin flag on purpose (docs/security.md).
 *
 *   bun run db:super-admin <email>
 *   bun run db:super-admin --remove <email>
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
if (!email) throw new Error("usage: bun scripts/super-admin.ts [--remove] <email>");

const [row] = await db
	.update(schema.user)
	.set({ isSuperAdmin: !remove })
	.where(eq(schema.user.email, email.toLowerCase()))
	.returning({ name: schema.user.name });
if (!row) throw new Error(`no user with the address ${email}`);
console.log(`${row.name} is ${remove ? "no longer" : "now"} a super admin`);
