import { describe, expect, test } from "vite-plus/test";
import { mergeFeed } from "./mergeFeed";

/** The project feed after a poll (docs/chat.md, "The project page"): new messages join, edits replace, deletions within the page's span go. */
const m = (id: string, createdAt: number, body = id) => ({ id, createdAt, body });

describe("mergeFeed", () => {
	test("a new message joins at the end, an edited one replaces its copy, oldest first", () => {
		const held = [m("a", 1), m("b", 2)];
		const out = mergeFeed(held, [m("c", 3), m("b", 2, "b edited")], true);
		expect(out).toEqual([m("a", 1), m("b", 2, "b edited"), m("c", 3)]);
	});
	test("a held message inside the fresh page's span that the page lacks was deleted; older ones stay", () => {
		const held = [m("a", 1), m("b", 2), m("c", 3), m("d", 4)];
		const out = mergeFeed(held, [m("d", 4), m("b", 2)], true);
		expect(out.map((x) => x.id)).toEqual(["a", "b", "d"]);
	});
	test("with nothing past the page, the page is the whole feed", () => {
		const out = mergeFeed([m("a", 1), m("b", 2)], [m("b", 2)], false);
		expect(out.map((x) => x.id)).toEqual(["b"]);
	});
	test("an empty fresh page with more keeps everything held", () => {
		expect(mergeFeed([m("a", 1)], [], true)).toEqual([m("a", 1)]);
	});
});
