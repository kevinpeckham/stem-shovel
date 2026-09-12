/**
 * Enrols the Screenshot Bot (src/lib/server/previewAuth.ts) in an account so
 * `bun run shot` can render that account's editing controls:
 *
 *   bun run db:preview-bot <account-slug> [role]      # role defaults to admin
 *   bun run db:preview-bot --remove <account-slug>
 *
 * Creates the bot user on first use. No import of src/lib/server (it pulls
 * in $app/*), so the schema and a direct libsql client are used.
 */
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { MEMBER_ROLES, type MemberRole } from "../src/lib/val/MemberRoleSchema";

const BOT_EMAIL = "screenshot-bot@stem-shovel.com";
const BOT_NAME = "Screenshot Bot";

const db = drizzle({
	connection: { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! },
	schema,
});

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const [slug, roleArg = "admin"] = args.filter((a) => a !== "--remove");
if (!slug) throw new Error("usage: bun scripts/preview-bot.ts [--remove] <account-slug> [role]");
if (!(MEMBER_ROLES as readonly string[]).includes(roleArg)) {
	throw new Error(`role must be one of ${MEMBER_ROLES.join(", ")}`);
}
const role = roleArg as MemberRole;

const account = await db.query.account.findFirst({ where: eq(schema.account.slug, slug) });
if (!account) throw new Error(`no account "${slug}"`);

let bot = await db.query.user.findFirst({ where: eq(schema.user.email, BOT_EMAIL) });
if (!bot && !remove) {
	[bot] = await db
		.insert(schema.user)
		.values({ name: BOT_NAME, email: BOT_EMAIL, emailVerified: true })
		.returning();
	console.log(`created user ${BOT_EMAIL}`);
}
if (!bot) throw new Error("the bot user does not exist; nothing to remove");

const where = and(
	eq(schema.accountMember.userId, bot.id),
	eq(schema.accountMember.accountId, account.id),
);
const existing = await db.query.accountMember.findFirst({ where });

if (remove) {
	if (!existing) throw new Error(`the bot is not a member of "${slug}"`);
	await db.delete(schema.accountMember).where(where);
	console.log(`removed the bot from ${account.name} (${slug})`);
} else if (existing) {
	await db.update(schema.accountMember).set({ role }).where(where);
	console.log(`the bot is now ${role} of ${account.name} (${slug})`);
} else {
	await db.insert(schema.accountMember).values({ accountId: account.id, userId: bot.id, role });
	console.log(`added the bot as ${role} of ${account.name} (${slug})`);
}
process.exit(0);
