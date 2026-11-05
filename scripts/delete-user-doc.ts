/**
 * Deletes a user doc page and every version it kept, by slug: for a page
 * the app no longer reads (the "releases" doc, after /releases began
 * rendering RELEASES.md on 2026-11-05). Dry run by default: prints what
 * it finds; `--apply` deletes, versions first then the page (Turso
 * enforces no foreign keys, so the cascade is explicit, as in
 * src/lib/server/cascade.ts `deleteUserDocRows`).
 *
 *   bun run db:delete-doc releases            # what would go
 *   bun run db:delete-doc releases --apply    # delete it
 *
 * APP_ENV=preview targets staging; production runs from Kevin's machine.
 * No import of src/lib/server (it pulls in $app/*).
 */
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const slugs = args.filter((a) => !a.startsWith("--"));
if (slugs.length === 0) {
	console.error("usage: bun run db:delete-doc <slug> [<slug> ...] [--apply]");
	process.exit(2);
}

const db = drizzle({
	connection: {
		url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
		authToken: process.env.TURSO_AUTH_TOKEN!,
	},
	schema,
});
console.log(`database: ${new URL(libsqlUrl(process.env.TURSO_DATABASE_URL!)).host}`);

for (const slug of slugs) {
	const doc = await db.query.userDoc.findFirst({ where: eq(schema.userDoc.slug, slug) });
	if (!doc) {
		console.log(`${slug}: not in the database`);
		continue;
	}
	const versions = await db.query.userDocVersion.findMany({
		where: eq(schema.userDocVersion.docId, doc.id),
		columns: { id: true },
	});
	const what = `${slug}: "${doc.title}" (${doc.kind}, version ${doc.version}, ${versions.length} saved version${versions.length === 1 ? "" : "s"}, ${doc.markdown.length} chars)`;
	if (!apply) {
		console.log(`${what} would be deleted; add --apply to delete it`);
		continue;
	}
	await db.delete(schema.userDocVersion).where(eq(schema.userDocVersion.docId, doc.id));
	await db.delete(schema.userDoc).where(eq(schema.userDoc.id, doc.id));
	console.log(`${what} deleted`);
}
