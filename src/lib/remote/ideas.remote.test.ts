import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asUser,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the Idea Recorder's remote functions: an idea is its
 * maker's own (docs/demo-recording.md, "Ownership"), so a fellow member of
 * the account is refused; only an editor starts one in an account.
 */
const ideas = await import("./ideas.remote");

const IDEA = fakeId("idea-one");

function givenIdeaOwnedBy(userId: string) {
	givenRow("idea", { accountId: ACCOUNT });
	data.userOwnsIdea.mockImplementation(async (_account: string, user: string) => user === userId);
}

beforeEach(resetRemoteMocks);

describe("createIdea", () => {
	const input = { accountId: ACCOUNT, title: "Riff", kind: "loop" };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(ideas.createIdea, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(ideas.createIdea, input)).rejects.toMatchObject(httpError(404));
		expect(data.createIdea).not.toHaveBeenCalled();
	});
	it("404 for a viewer", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(ideas.createIdea, input)).rejects.toMatchObject(httpError(404));
	});
	it("an editor creates it as their own, with the kind they asked for", async () => {
		asEditorOf(ACCOUNT);
		data.createIdea.mockResolvedValue({ id: IDEA, title: "Riff" });
		await expect(call(ideas.createIdea, input)).resolves.toEqual({ id: IDEA, title: "Riff" });
		expect(data.createIdea).toHaveBeenCalledWith(ACCOUNT, USER, "Riff", "loop");
	});
});

describe("the idea's own functions (creatorship, not membership)", () => {
	const cases = [
		{
			name: "renameIdea",
			fn: ideas.renameIdea,
			input: { id: IDEA, title: "Chorus idea" },
			dataFn: "renameIdea",
			args: [ACCOUNT, IDEA, "Chorus idea"],
			result: true,
			answer: { title: "Chorus idea" },
		},
		{
			name: "saveIdeaNotes",
			fn: ideas.saveIdeaNotes,
			input: { id: IDEA, markdown: "# Notes" },
			dataFn: "setIdeaNotes",
			args: [ACCOUNT, IDEA, "# Notes"],
			result: true,
			answer: { saved: true, ideaDeleted: false },
		},
		{
			name: "setIdeaKind",
			fn: ideas.setIdeaKind,
			input: { id: IDEA, kind: "idea" },
			dataFn: "setIdeaKind",
			args: [ACCOUNT, IDEA, "idea"],
			result: true,
			answer: { kind: "idea" },
		},
		{
			name: "saveIdeaInstruments",
			fn: ideas.saveIdeaInstruments,
			input: { id: IDEA, drums: null, piano: null },
			dataFn: "setIdeaInstruments",
			args: [ACCOUNT, IDEA, { drums: null, piano: null, looper: null, chords: null }],
			result: { drums: null, piano: null, looper: null, chords: null },
			answer: { drums: null, piano: null, looper: null, chords: null },
		},
		{
			name: "dropIdeaIfEmpty",
			fn: ideas.dropIdeaIfEmpty,
			input: { id: IDEA },
			dataFn: "deleteIdeaIfEmpty",
			args: [ACCOUNT, IDEA],
			result: true,
			answer: { ideaDeleted: true },
		},
		{
			name: "deleteIdeaNow",
			fn: ideas.deleteIdeaNow,
			input: { id: IDEA },
			dataFn: "deleteIdea",
			args: [ACCOUNT, IDEA],
			result: true,
			answer: { deleted: true },
		},
		{
			name: "deleteIdea (form)",
			fn: ideas.deleteIdea,
			input: { id: IDEA },
			dataFn: "deleteIdea",
			args: [ACCOUNT, IDEA],
			result: true,
			answer: { deleted: true },
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for an owner of the account who did not make the idea", async () => {
				givenIdeaOwnedBy(OTHER_USER);
				asMemberOf(ACCOUNT, "owner");
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for an idea that does not exist", async () => {
				givenRow("idea", null);
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data.userOwnsIdea).not.toHaveBeenCalled();
			});
			it("the maker reaches the data layer scoped by the idea's account", async () => {
				givenIdeaOwnedBy(USER);
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(c.result);
				await expect(call(c.fn, c.input)).resolves.toEqual(c.answer);
				expect(data.userOwnsIdea).toHaveBeenCalledWith(ACCOUNT, USER, IDEA);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("renderNotes", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(ideas.renderNotes, "hi")).rejects.toMatchObject(httpError(401));
	});
	it("renders for anyone signed in, member of nothing", async () => {
		asUser();
		await expect(call(ideas.renderNotes, "hi")).resolves.toBe("<p>hi</p>");
	});
});
