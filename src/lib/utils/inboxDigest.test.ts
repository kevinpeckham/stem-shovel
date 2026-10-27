import { describe, expect, test } from "vite-plus/test";
import { inboxDigest } from "./inboxDigest";

const item = (
	id: string,
	kind: string,
	minute: number,
	over: { count?: number; read?: boolean } = {},
) => ({
	id,
	kind,
	count: over.count ?? 1,
	readAt: over.read ? new Date(2026, 9, 27, 12) : null,
	updatedAt: new Date(2026, 9, 27, 10, minute),
});

describe("inboxDigest", () => {
	test("nothing unread", () => {
		expect(inboxDigest([item("a", "comment", 1, { read: true })])).toEqual({
			unread: 0,
			byKind: [],
			newest: [],
		});
		expect(inboxDigest([])).toEqual({ unread: 0, byKind: [], newest: [] });
	});

	test("counts the unread per kind by their bundled events, most first", () => {
		const d = inboxDigest([
			item("a", "session", 1),
			item("b", "comment", 2, { count: 2 }),
			item("c", "chat", 3, { count: 2 }),
			item("d", "comment", 4),
			item("e", "comment", 5, { read: true, count: 7 }),
		]);
		expect(d.unread).toBe(4);
		expect(d.byKind).toEqual([
			{ kind: "comment", count: 3 },
			{ kind: "chat", count: 2 },
			{ kind: "session", count: 1 },
		]);
	});

	test("the five newest unread, newest first", () => {
		const items = [1, 7, 3, 9, 5, 2, 8].map((m) => item(`n${m}`, "comment", m));
		items.push(item("read", "comment", 10, { read: true }));
		expect(inboxDigest(items).newest.map((i) => i.id)).toEqual(["n9", "n8", "n7", "n5", "n3"]);
	});
});
