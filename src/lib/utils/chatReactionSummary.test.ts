import { describe, expect, it } from "vite-plus/test";
import { chatReactionSummary } from "./chatReactionSummary";

describe("chatReactionSummary", () => {
	const r = (emoji: "👍" | "🔥" | "👀", userId: string, name: string) => ({
		emoji,
		userId,
		user: { name },
	});
	it("one entry per emoji chosen, in the fixed set's order, with the count, the names and whether the viewer is among them", () => {
		const rows = [r("🔥", "u1", "Ann"), r("👍", "u2", "Bob"), r("🔥", "u2", "Bob")];
		expect(chatReactionSummary(rows, "u2")).toEqual([
			{ emoji: "👍", count: 1, mine: true, names: ["Bob"] },
			{ emoji: "🔥", count: 2, mine: true, names: ["Ann", "Bob"] },
		]);
		expect(chatReactionSummary(rows, "u1").map((s) => s.mine)).toEqual([false, true]);
	});
	it("without a viewer nothing is theirs; a lost user reads as Someone; no reactions, no entries", () => {
		expect(chatReactionSummary([{ emoji: "👀", userId: "x", user: null }])).toEqual([
			{ emoji: "👀", count: 1, mine: false, names: ["Someone"] },
		]);
		expect(chatReactionSummary([], "u1")).toEqual([]);
	});
});
