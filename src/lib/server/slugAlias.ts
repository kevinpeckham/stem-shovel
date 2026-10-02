import { db, schema } from "$lib/server/db";
import { renamedPathname } from "$lib/utils/renamedPathname";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Old addresses (docs/data-model.md, "slug_alias"). A rename that changes a
 * slug records the old one; a page asked for a slug that is not live looks
 * it up here and redirects, permanently, to the current address, with the
 * query string (a `?share=` code) carried along.
 *
 * No circles: the live slug always wins. `recordSlugChange` first removes
 * any alias for the slug being moved onto, so a project renamed A → B and
 * then back to A ends with A live and B → A on record, never A → B as
 * well; and the loaders only consult an alias when the slug is not live,
 * so a slug that is live again never reaches one. Should an alias ever
 * name the slug its target already has, `renamedPathname` answers null
 * and the page is a 404 instead of a redirect to itself.
 */

const { slugAlias, account, project, song } = schema;
type Kind = "account" | "project" | "song";

/** The id the slug belonged to, or null. `scopeId` is "" for an account. */
export async function aliasTarget(kind: Kind, scopeId: string, slug: string) {
	const row = await db.query.slugAlias.findFirst({
		where: and(eq(slugAlias.kind, kind), eq(slugAlias.scopeId, scopeId), eq(slugAlias.slug, slug)),
		columns: { targetId: true },
	});
	return row?.targetId ?? null;
}

/** A slug just became live (created, or renamed onto): no alias may claim it any more. */
export async function claimSlug(kind: Kind, scopeId: string, slug: string) {
	await db
		.delete(slugAlias)
		.where(and(eq(slugAlias.kind, kind), eq(slugAlias.scopeId, scopeId), eq(slugAlias.slug, slug)));
}

/** The slug moved from `from` to `to`: `from` redirects to the target from now on (and `to` stops redirecting anywhere). */
export async function recordSlugChange(
	kind: Kind,
	scopeId: string,
	targetId: string,
	from: string,
	to: string,
) {
	if (from === to) return;
	await claimSlug(kind, scopeId, to);
	await db
		.insert(slugAlias)
		.values({ kind, scopeId, slug: from, targetId })
		.onConflictDoUpdate({
			target: [slugAlias.kind, slugAlias.scopeId, slugAlias.slug],
			set: { targetId, updatedAt: new Date() },
		});
}

/** Every slug an account used to have (reserved: a new account cannot take an address people may still follow). */
export async function aliasedAccountSlugs() {
	const rows = await db
		.select({ slug: slugAlias.slug })
		.from(slugAlias)
		.where(eq(slugAlias.kind, "account"));
	return rows.map((r) => r.slug);
}

/** The aliases of deleted accounts, projects or songs go with them (src/lib/server/cascade.ts). */
export async function deleteAliasesOf(targetIds: string[]) {
	if (targetIds.length === 0) return;
	await db.delete(slugAlias).where(inArray(slugAlias.targetId, targetIds));
}

/** Where a page under an account's old slug lives now (path + query), or null when the slug was never that account's. */
export async function renamedAccountPath(url: URL, slug: string) {
	const targetId = await aliasTarget("account", "", slug);
	if (!targetId) return null;
	const row = await db.query.account.findFirst({
		where: eq(account.id, targetId),
		columns: { slug: true },
	});
	if (!row) return null;
	const path = renamedPathname(url.pathname, { account: row.slug });
	return path ? path + url.search : null;
}

/**
 * Where a project page (or a song page under it, when `songSlug` is given)
 * lives now, or null when neither the project nor the song can be found
 * through its old slug. The project is resolved first, live or by alias,
 * then the song within it the same way.
 */
export async function renamedProjectPath(
	url: URL,
	accountId: string,
	projectSlug: string,
	songSlug?: string,
) {
	let proj = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, projectSlug)),
		columns: { id: true, slug: true },
	});
	if (!proj) {
		const id = await aliasTarget("project", accountId, projectSlug);
		if (!id) return null;
		proj = await db.query.project.findFirst({
			where: and(eq(project.accountId, accountId), eq(project.id, id)),
			columns: { id: true, slug: true },
		});
		if (!proj) return null;
	}
	let current: { project: string; song?: string } = { project: proj.slug };
	if (songSlug !== undefined) {
		let s = await db.query.song.findFirst({
			where: and(eq(song.projectId, proj.id), eq(song.slug, songSlug)),
			columns: { slug: true },
		});
		if (!s) {
			const id = await aliasTarget("song", proj.id, songSlug);
			if (!id) return null;
			s = await db.query.song.findFirst({
				where: and(eq(song.projectId, proj.id), eq(song.id, id)),
				columns: { slug: true },
			});
			if (!s) return null;
		}
		current = { ...current, song: s.slug };
	}
	const path = renamedPathname(url.pathname, current);
	return path ? path + url.search : null;
}
