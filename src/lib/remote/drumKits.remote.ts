import { command, getRequestEvent, query } from "$app/server";
import { isEditor, memberOf, requireSystemAdmin, requireUser } from "#lib/server/access.js";
import {
	accountOfDrumKit,
	createDrumKit as create,
	deleteDrumKit as removeKit,
	deleteDrumSample as removeSample,
	drumSampleOwner,
	listDrumKitManifests,
	listDrumKitsFor,
	renameDrumKit as rename,
	setDrumSampleSource as setSource,
} from "#lib/server/data.js";
import {
	DrumKitCreateSchema,
	DrumKitListSchema,
	DrumKitRenameSchema,
	DrumSampleSourceSchema,
} from "#lib/val/DrumKitSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/**
 * Custom drum kits (docs/drum-machine.md, "Custom kits"): an account's kits
 * are its editors' to make and keep and its members' to play; the site's
 * (no account) are a system admin's and play for everyone. The samples
 * themselves go up through /api/drum-samples.
 */

/** The kits a page shows in its manager: the site's and, with an account the caller belongs to, the account's; a system admin sees the site's as editable. */
export const listDrumKits = query(DrumKitListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	if (accountId) await memberOf(locals, async () => accountId, accountId, { viewers: true });
	return listDrumKitsFor(accountId ?? null);
});

/** The kits the drum machine may play after a change (the site's and the account's, each voice's file by URL). */
export const drumKitManifests = query(DrumKitListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	if (accountId) await memberOf(locals, async () => accountId, accountId, { viewers: true });
	return listDrumKitManifests(accountId ?? null);
});

/** Who may change a kit: an editor of its account, or a system admin for a site kit; anyone else sees no kit. */
async function kitEditor(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const kit = await accountOfDrumKit(id);
	if (!kit) error(404, "Kit not found");
	if (kit.accountId) {
		const m = await memberOf(locals, async () => kit.accountId, kit.accountId);
		if (!isEditor(m.role)) error(404, "Kit not found");
	} else requireSystemAdmin(locals);
	return kit.accountId;
}

export const createDrumKit = command(DrumKitCreateSchema, async ({ accountId, name }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	if (accountId) {
		const m = await memberOf(locals, async () => accountId, accountId);
		if (!isEditor(m.role)) error(404, "Account not found");
	} else requireSystemAdmin(locals);
	const row = await create(accountId ?? null, user.id, name);
	if (row === "full") error(409, "This account has as many kits as it can hold");
	return { id: row.id, name: row.name };
});

export const renameDrumKit = command(DrumKitRenameSchema, async ({ id, name }) => {
	const accountId = await kitEditor(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Kit not found");
	return { id: row.id, name: row.name };
});

export const deleteDrumKit = command(IdSchema, async ({ id }) => {
	const accountId = await kitEditor(id);
	await removeKit(accountId, id);
	return { id };
});

export const setDrumSampleSource = command(DrumSampleSourceSchema, async ({ id, source }) => {
	const owner = await drumSampleOwner(id);
	if (!owner) error(404, "Sample not found");
	await kitEditor(owner.kitId);
	const row = await setSource(id, source);
	if (!row) error(404, "Sample not found");
	return row;
});

export const deleteDrumSample = command(IdSchema, async ({ id }) => {
	const owner = await drumSampleOwner(id);
	if (!owner) error(404, "Sample not found");
	await kitEditor(owner.kitId);
	await removeSample(id);
	return { id };
});
