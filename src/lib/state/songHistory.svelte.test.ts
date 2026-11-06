import { describe, expect, test } from "vite-plus/test";
import { SongHistory } from "./songHistory.svelte.js";

/** The history panel's subject and who may restore it: an editor for a project document, anyone for their own note, the author or an admin for a comment. */
function setup({ canEdit = false, me = "u1", admin = false } = {}) {
	const comments = [
		{ id: "c1", userId: "u1" },
		{ id: "c2", userId: "u2" },
	];
	const canEditComment = (c: { userId: string }) => c.userId === me;
	return new SongHistory({
		canEdit: () => canEdit,
		comments: () => comments,
		canEditComment,
		canDeleteComment: (c) => canEditComment(c) || admin,
	});
}

const doc = (kind: "chart" | "mynotes") =>
	({ kind: "doc", songId: "s1", doc: kind, label: "Chart" }) as const;
const comment = (id: string) => ({ kind: "comment", commentId: id, label: "“Bridge”" }) as const;

describe("SongHistory", () => {
	test("open and close set the target", () => {
		const history = setup();
		expect(history.target).toBeNull();
		expect(history.restorable).toBe(false);
		history.open(doc("chart"));
		expect(history.target).toEqual(doc("chart"));
		history.close();
		expect(history.target).toBeNull();
	});

	test("a project document: an editor restores, a visitor does not", () => {
		const visitor = setup();
		visitor.open(doc("chart"));
		expect(visitor.restorable).toBe(false);
		const editor = setup({ canEdit: true });
		editor.open(doc("chart"));
		expect(editor.restorable).toBe(true);
	});

	test("the user's own note: always restorable", () => {
		const history = setup();
		history.open(doc("mynotes"));
		expect(history.restorable).toBe(true);
	});

	test("a comment: its author or an admin restores; another member and a missing comment do not", () => {
		const history = setup();
		history.open(comment("c1"));
		expect(history.restorable).toBe(true);
		history.open(comment("c2"));
		expect(history.restorable).toBe(false);
		history.open(comment("gone"));
		expect(history.restorable).toBe(false);
		const admin = setup({ admin: true });
		admin.open(comment("c2"));
		expect(admin.restorable).toBe(true);
	});
});
