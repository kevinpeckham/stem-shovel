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

/** User documentation (/docs) is written by system admins only; reading is public. */
export const createUserDoc = form(UserDocCreateSchema, async ({ title }) => {
	const { locals } = getRequestEvent();
	const user = requireSystemAdmin(locals);
	const row = await create(user.id, title);
	redirect(303, `/docs/${row.slug}/edit`);
});

export const updateUserDoc = form(
	UserDocMetaSchema,
	async ({ id, title, slug, sortOrder }, issue) => {
		const { locals } = getRequestEvent();
		requireSystemAdmin(locals);
		const result = await updateUserDocMeta(id, { title, slug, sortOrder });
		if (!result.ok) invalid(issue.slug(result.error));
		redirect(303, `/docs/${result.doc.slug}`);
	},
);

export const deleteUserDoc = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await drop(id))) error(404, "Page not found");
	redirect(303, "/docs");
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
