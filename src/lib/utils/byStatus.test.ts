import { describe, expect, it } from "vite-plus/test";
import { byStatus } from "./byStatus";

describe("byStatus", () => {
	it("puts open before complete before closed, unknown last, and keeps the order within a status", () => {
		const rows = [
			{ id: "a", status: "closed" },
			{ id: "b", status: "open" },
			{ id: "c", status: "odd" },
			{ id: "d", status: "complete" },
			{ id: "e", status: "open" },
		];
		expect([...rows].sort(byStatus).map((r) => r.id)).toEqual(["b", "e", "d", "a", "c"]);
	});
});
