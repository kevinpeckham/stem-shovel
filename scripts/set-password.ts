/**
 * Gives an existing user (e.g. the seeded owner, created before sign-in
 * existed) an email/password credential so they can sign in.
 *
 *   PASSWORD='…' bun run db:set-password kevin@lightningjar.com
 */
// No import of src/lib/auth here: it pulls in $app/* (SvelteKit-only). The
// hasher is Better Auth's own, so the credential is exactly what sign-up makes.
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const db = drizzle({
	connection: {
		url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
		authToken: process.env.TURSO_AUTH_TOKEN!,
	},
	schema,
});

const [email] = process.argv.slice(2);
const password = process.env.PASSWORD;
if (!email || !password) throw new Error("usage: PASSWORD=… bun scripts/set-password.ts <email>");
if (password.length < 8) throw new Error("password must be at least 8 characters");

const user = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
if (!user) throw new Error(`no user ${email}`);

const hash = await hashPassword(password);
const existing = await db.query.authAccount.findFirst({
	where: eq(schema.authAccount.userId, user.id),
});
if (existing?.providerId === "credential") {
	await db
		.update(schema.authAccount)
		.set({ password: hash })
		.where(eq(schema.authAccount.id, existing.id));
	console.log(`updated password for ${email}`);
} else {
	await db.insert(schema.authAccount).values({
		id: crypto.randomUUID(),
		accountId: user.id,
		providerId: "credential",
		userId: user.id,
		password: hash,
	});
	console.log(`created credential for ${email}`);
}
process.exit(0);
