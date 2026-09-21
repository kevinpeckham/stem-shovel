import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin } from "$lib/server/access";
import {
	createUserDoc as create,
	deleteUserDoc as drop,
	saveUserDoc as save,
	updateUserDocMeta,
} from "$lib/server/data";
import { IdSchema } from "$lib/val/SongSchema";
import { UserDocCreateSchema, UserDocMetaSchema, UserDocSaveSchema } from "$lib/val/UserDocSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/** Where a page or post lives: the docs or the blog. */
const sectionOf = (kind: string) => (kind === "post" ? "/blog" : "/docs");

/** User documentation (/docs) and the blog (/blog) are written by system admins only; reading is public. */
export const createUserDoc = form(UserDocCreateSchema, async ({ title, kind }) => {
	const { locals } = getRequestEvent();
	const user = requireSystemAdmin(locals);
	const row = await create(user.id, title, kind);
	redirect(303, `${sectionOf(row.kind)}/${row.slug}/edit`);
});

export const updateUserDoc = form(
	UserDocMetaSchema,
	async ({ id, title, slug, sortOrder, published }, issue) => {
		const { locals } = getRequestEvent();
		requireSystemAdmin(locals);
		const result = await updateUserDocMeta(id, {
			title,
			slug,
			sortOrder,
			published,
		});
		if (!result.ok) invalid(issue.slug(result.error));
		redirect(303, `${sectionOf(result.doc.kind)}/${result.doc.slug}`);
	},
);

export const deleteUserDoc = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	const row = await drop(id);
	if (!row) error(404, "Page not found");
	redirect(303, sectionOf(row.kind));
});

/** The editor's save; mirrors songs.remote's saveDoc. */
export const saveUserDoc = form(
	UserDocSaveSchema,
	async ({ id, markdown, confirmEmpty }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireSystemAdmin(locals);
		const result = await save(id, user.id, markdown, { confirmEmpty: confirmEmpty === "true" });
		if (!result.ok) {
			if (result.needsConfirm) return { needsConfirm: true as const, error: result.error };
			invalid(issue.markdown(result.error));
		}
		return { version: result.version, changed: result.changed };
	},
);
