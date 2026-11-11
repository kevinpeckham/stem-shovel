import { describe, expect, it } from "vite-plus/test";
import { accountShareLinkOf } from "./accountShareLinkOf";

type Row = Parameters<typeof accountShareLinkOf>[0];

const made = new Date(Date.UTC(2026, 10, 1));
const row = (over: Partial<Row> = {}): Row => ({
	id: "link-1",
	code: "ABCD2345",
	note: "for the label",
	uses: 2,
	maxUses: 5,
	expiresAt: null,
	createdAt: made,
	revokedAt: null,
	songId: null,
	mixId: null,
	demoId: null,
	projectId: null,
	recordingId: null,
	sessionId: null,
	setListId: null,
	creator: { name: "Kevin" },
	song: null,
	project: null,
	recording: null,
	session: null,
	setList: null,
	...over,
});
const song = { title: "Eat All the Clocks", slug: "clocks", project: { name: "LP", slug: "lp" } };

describe("accountShareLinkOf", () => {
	it("carries the link's own fields and the creator's name", () => {
		const out = accountShareLinkOf(
			row({ projectId: "p1", project: { name: "LP", slug: "lp" } }),
			"mmkk",
		);
		expect(out).toMatchObject({
			id: "link-1",
			code: "ABCD2345",
			note: "for the label",
			uses: 2,
			maxUses: 5,
			createdAt: made,
			createdByName: "Kevin",
		});
		expect(out).not.toHaveProperty("state");
	});

	it("names a creator who left as null", () => {
		const out = accountShareLinkOf(row({ projectId: "p1", creator: null }), "mmkk");
		expect(out.createdByName).toBeNull();
	});

	it("a song opens the song's page", () => {
		expect(accountShareLinkOf(row({ songId: "s1", song }), "mmkk")).toMatchObject({
			kind: "song",
			title: "Eat All the Clocks",
			path: "/mmkk/projects/lp/clocks",
		});
	});

	it("a mix opens the song's mix page", () => {
		expect(accountShareLinkOf(row({ songId: "s1", mixId: "m1", song }), "mmkk")).toMatchObject({
			kind: "mix",
			title: "Eat All the Clocks · mix",
			path: "/mmkk/projects/lp/clocks/mixes/m1",
		});
	});

	it("a demo opens the song's demo page", () => {
		expect(accountShareLinkOf(row({ songId: "s1", demoId: "d1", song }), "mmkk")).toMatchObject({
			kind: "demo",
			title: "Eat All the Clocks · demo",
			path: "/mmkk/projects/lp/clocks/demos/d1",
		});
	});

	it("a project opens the project's page", () => {
		expect(
			accountShareLinkOf(row({ projectId: "p1", project: { name: "LP", slug: "lp" } }), "mmkk"),
		).toMatchObject({ kind: "project", title: "LP", path: "/mmkk/projects/lp" });
	});

	it("a recording opens its own page, called Recording when untitled", () => {
		expect(
			accountShareLinkOf(
				row({ recordingId: "r1", recording: { id: "r1", title: "Set one" } }),
				"mmkk",
			),
		).toMatchObject({ kind: "recording", title: "Set one", path: "/mmkk/sessions/r/r1" });
		expect(
			accountShareLinkOf(row({ recordingId: "r1", recording: { id: "r1", title: " " } }), "mmkk")
				.title,
		).toBe("Recording");
	});

	it("a session opens its page, named or called after its place or kind and day", () => {
		const session = {
			id: "x1",
			name: "Album night",
			place: "",
			kind: "practice" as const,
			startsOn: "2026-10-18",
		};
		expect(accountShareLinkOf(row({ sessionId: "x1", session }), "mmkk")).toMatchObject({
			kind: "session",
			title: "Album night",
			path: "/mmkk/sessions/s/x1",
		});
		expect(
			accountShareLinkOf(row({ sessionId: "x1", session: { ...session, name: "" } }), "mmkk").title,
		).toBe("Practice · Oct 18, 2026");
	});

	it("a set list opens its show view", () => {
		expect(
			accountShareLinkOf(
				row({ setListId: "l1", setList: { id: "l1", title: "Spring tour" } }),
				"mmkk",
			),
		).toMatchObject({ kind: "set list", title: "Spring tour", path: "/mmkk/set-lists/l1/show" });
	});

	it("a deleted target keeps its kind, with no page", () => {
		const cases: [Partial<Row>, string][] = [
			[{ songId: "s1" }, "song"],
			[{ songId: "s1", mixId: "m1" }, "mix"],
			[{ songId: "s1", demoId: "d1" }, "demo"],
			[{ projectId: "p1" }, "project"],
			[{ recordingId: "r1" }, "recording"],
			[{ sessionId: "x1" }, "session"],
			[{ setListId: "l1" }, "set list"],
		];
		for (const [over, kind] of cases) {
			expect(accountShareLinkOf(row(over), "mmkk")).toMatchObject({
				kind,
				title: "(deleted)",
				path: null,
			});
		}
	});
});
