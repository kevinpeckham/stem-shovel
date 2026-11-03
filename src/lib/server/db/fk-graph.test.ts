import { describe, expect, it } from "vite-plus/test";
import { allForeignKeys } from "./fk-graph";

describe("allForeignKeys", () => {
	const fks = allForeignKeys();

	it("reads the schema's foreign keys with their parent and action", () => {
		expect(fks.length).toBeGreaterThan(100);
		expect(fks).toContainEqual({
			table: "song",
			column: "project_id",
			parent: "project",
			parentColumn: "id",
			onDelete: "cascade",
		});
	});

	it("gives every key an action", () => {
		for (const fk of fks)
			expect(["cascade", "set null", "no action", "restrict"]).toContain(fk.onDelete);
	});
});
