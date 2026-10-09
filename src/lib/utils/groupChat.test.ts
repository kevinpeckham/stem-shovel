import { describe, expect, it } from "vite-plus/test";
import { groupChat, unreadCount } from "./groupChat";

const DAY = 24 * 60 * 60 * 1000;
// Noon on a fixed day, so a message a day later is on the next date whatever the zone.
const T0 = new Date(2026, 9, 9, 12, 0, 0).getTime();
const msg = (id: string, userId: string, offset: number) => ({
	id,
	userId,
	authorName: userId === "u1" ? "Pat" : "Sam",
	createdAt: T0 + offset,
});

describe("groupChat", () => {
	it("one date line per day, and same-author messages within five minutes share a run", () => {
		const lines = groupChat(
			[
				msg("a", "u1", 0),
				msg("b", "u1", 60_000),
				msg("c", "u2", 90_000),
				msg("d", "u1", 120_000),
				msg("e", "u1", 120_000 + 6 * 60_000),
				msg("f", "u1", DAY),
			],
			T0 + 2 * DAY,
			"u1",
		);
		expect(lines.map((l) => l.kind)).toEqual(["date", "run", "run", "run", "run", "date", "run"]);
		const runs = lines.filter((l) => l.kind === "run").map((l) => l.run.messages.map((m) => m.id));
		expect(runs).toEqual([["a", "b"], ["c"], ["d"], ["e"], ["f"]]);
	});
	it("a 'New' line sits above the first of others' messages past the mark, and breaks the run", () => {
		const lines = groupChat(
			[msg("a", "u2", 0), msg("b", "u2", 1000), msg("c", "u2", 2000), msg("d", "u1", 3000)],
			T0 + 1000,
			"u1",
		);
		expect(lines.map((l) => l.kind)).toEqual(["date", "run", "new", "run", "run"]);
		expect(lines[1]).toMatchObject({ run: { messages: [{ id: "a" }, { id: "b" }] } });
		expect(lines[3]).toMatchObject({ run: { messages: [{ id: "c" }] } });
	});
	it("never read: everything by others is new; one's own never is", () => {
		expect(unreadCount([msg("a", "u2", 0), msg("b", "u1", 1)], null, "u1")).toBe(1);
		expect(unreadCount([msg("a", "u2", 0), msg("b", "u2", 1)], T0 + 5, "u1")).toBe(0);
		expect(groupChat([msg("a", "u1", 0)], null, "u1").map((l) => l.kind)).toEqual(["date", "run"]);
	});
	it("an empty chat has no lines", () => {
		expect(groupChat([], null, null)).toEqual([]);
	});
});
