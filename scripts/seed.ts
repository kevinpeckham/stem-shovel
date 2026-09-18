/**
 * Seeds the single account + user the app runs as until there is real auth.
 * Idempotent. Run with `bun run db:seed` (varlock supplies the Turso vars).
 */
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("Turso vars missing; run via varlock");
const db = drizzle({
	connection: { url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN },
	schema,
});

const SEED = {
	user: { name: "Kevin Peckham", email: "kevin@lightningjar.com", emailVerified: true },
	account: { name: "Lightning Jar", slug: "lightning-jar" },
};

await db.insert(schema.user).values(SEED.user).onConflictDoNothing();
await db.insert(schema.account).values(SEED.account).onConflictDoNothing();
const [u] = await db.select().from(schema.user).where(eq(schema.user.email, SEED.user.email));
const [a] = await db
	.select()
	.from(schema.account)
	.where(eq(schema.account.slug, SEED.account.slug));
await db
	.insert(schema.accountMember)
	.values({ userId: u.id, accountId: a.id, role: "owner" })
	.onConflictDoNothing();

console.log(`user ${u.email} (${u.id}) is owner of account ${a.slug} (${a.id})`);
