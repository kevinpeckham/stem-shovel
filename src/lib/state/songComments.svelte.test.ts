import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

/** The comment forms as stand-ins whose fields record what the draft pushes into them. */
const forms = vi.hoisted(() => {
	const form = () => ({
		fields: { title: { set: vi.fn() }, body: { set: vi.fn() }, position: { set: vi.fn() } },
	});
	return { createComment: form(), updateComment: form() };
});
vi.mock("#lib/remote/comments.remote.js", () => forms);

const { SongComments } = await import("./songComments.svelte.js");

function setup({ user = "u1" as string | null, admin = false } = {}) {
	const comments = new SongComments({
		user: () => (user ? { id: user } : null),
		memberships: () => [{ accountId: "a1", role: admin ? "admin" : "member" }],
		accountId: () => "a1",
		readyDemos: () => [{ id: "d1", label: "Kitchen take" }],
		editPos: (s) => `bar ${s}`,
	});
	const panel = { showPopover: vi.fn(), hidePopover: vi.fn() };
	comments.panel = panel as unknown as HTMLDivElement;
	return { comments, panel };
}

const row = { id: "c1", userId: "u1", title: "Bridge", body: "Too loud", at: 12 };

beforeEach(() => {
	for (const f of Object.values(forms))
		for (const field of Object.values(f.fields)) field.set.mockClear();
});

describe("SongComments", () => {
	test("the author may edit and delete; another member neither", () => {
		const { comments } = setup();
		expect(comments.canEdit(row)).toBe(true);
		expect(comments.canDelete(row)).toBe(true);
		expect(comments.canEdit({ userId: "u2" })).toBe(false);
		expect(comments.canDelete({ userId: "u2" })).toBe(false);
		expect(comments.isAdmin).toBe(false);
	});

	test("an admin may delete another's comment but not edit it; signed out, neither", () => {
		const admin = setup({ user: "u9", admin: true }).comments;
		expect(admin.isAdmin).toBe(true);
		expect(admin.canEdit(row)).toBe(false);
		expect(admin.canDelete(row)).toBe(true);
		const out = setup({ user: null }).comments;
		expect(out.canEdit(row)).toBe(false);
		expect(out.canDelete(row)).toBe(false);
	});

	test("open starts a fresh draft, clears the error, fills the create form and shows the popover", () => {
		const { comments, panel } = setup();
		comments.error = "Earlier";
		comments.draft = { id: "old", title: "x", body: "y", at: "1", demoId: "d1" };
		comments.open({ at: "3|1" });
		expect(comments.draft).toEqual({ id: null, title: "", body: "", at: "3|1", demoId: "" });
		expect(comments.error).toBeNull();
		expect(forms.createComment.fields.position.set).toHaveBeenCalledWith("3|1");
		expect(forms.createComment.fields.title.set).toHaveBeenCalledWith("");
		expect(forms.updateComment.fields.title.set).not.toHaveBeenCalled();
		expect(panel.showPopover).toHaveBeenCalledOnce();
	});

	test("edit fills the update form with the row, its position in the readout's format", () => {
		const { comments } = setup();
		comments.edit(row);
		expect(comments.draft).toEqual({
			id: "c1",
			title: "Bridge",
			body: "Too loud",
			at: "bar 12",
			demoId: "",
		});
		expect(forms.updateComment.fields.body.set).toHaveBeenCalledWith("Too loud");
		expect(forms.updateComment.fields.position.set).toHaveBeenCalledWith("bar 12");
		comments.edit({ ...row, at: null });
		expect(comments.draft.at).toBe("");
	});

	test("editDemo keeps the demo and reads the position as time; demoTarget names the demo", () => {
		const { comments } = setup();
		expect(comments.demoTarget).toBeNull();
		comments.editDemo({ ...row, demoId: "d1", at: 65.5 });
		expect(comments.draft.demoId).toBe("d1");
		expect(comments.draft.at).toBe("1:05.50");
		expect(comments.demoTarget?.label).toBe("Kitchen take");
	});

	test("close hides the popover", () => {
		const { comments, panel } = setup();
		comments.close();
		expect(panel.hidePopover).toHaveBeenCalledOnce();
	});
});
