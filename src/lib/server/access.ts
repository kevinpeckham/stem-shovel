import { db, schema } from "$lib/server/db";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

/**
 * Tenant checks. The account a request may touch is never taken from the
 * URL alone: pages resolve `[account]` against `locals.memberships`, and
 * mutations look up the entity's account and check membership too, so a
 * forged id from another tenant is "not found".
 */

export function requireMember(locals: App.Locals, accountId: string) {
	const m = locals.memberships.find((m) => m.accountId === accountId);
	if (!m) error(404, "Not found");
	return m;
}

/**
 * Viewing is public: anyone with the URL can open an account's projects and
 * play its songs. Editing (uploading, renaming, deleting, settings) needs
 * membership, which every mutation checks on its own via requireMember /
 * memberOf. Pages use `canEdit` only to show or hide the controls.
 */
export async function publicAccountBySlug(slug: string) {
	const row = await db.query.account.findFirst({
		where: eq(schema.account.slug, slug),
		columns: { id: true, name: true, slug: true },
	});
	if (!row) error(404, `No account "${slug}"`);
	return row;
}

export function canEdit(locals: App.Locals, accountId: string): boolean {
	return locals.memberships.some((m) => m.accountId === accountId);
}

export function requireAccountBySlug(locals: App.Locals, slug: string) {
	const m = locals.memberships.find((m) => m.slug === slug);
	if (!m) error(404, `No account "${slug}"`);
	return { id: m.accountId, slug: m.slug, name: m.name, role: m.role };
}

const { project, song, stem } = schema;

/** Account of an entity by id (unscoped lookup); pair with requireMember. */
export async function accountOfProject(projectId: string) {
	const row = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfSong(songId: string) {
	const row = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfStem(stemId: string) {
	const row = await db.query.stem.findFirst({
		where: eq(stem.id, stemId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfStemPathname(pathname: string) {
	const row = await db.query.stem.findFirst({
		where: eq(stem.pathname, pathname),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

/** Membership for an entity's account, or 404. */
export async function memberOf(
	locals: App.Locals,
	lookup: (id: string) => Promise<string | null>,
	id: string,
) {
	const accountId = await lookup(id);
	if (!accountId) error(404, "Not found");
	return requireMember(locals, accountId);
}
