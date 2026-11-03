import { describe, expect, it } from "vite-plus/test";
import { fkListDiff } from "./fkListDiff";

const a = { table: "song", column: "projectId", parent: "project", parentColumn: "id" };
const b = { table: "stem", column: "songId", parent: "song", parentColumn: "id" };
const c = { table: "take", column: "ideaId", parent: "idea", parentColumn: "id" };

describe("fkListDiff", () => {
	it("finds nothing when both lists hold the same edges in any order", () => {
		expect(fkListDiff([a, b], [b, a])).toEqual({ missingLive: [], missingDeclared: [] });
	});

	it("reports each side's extra edges", () => {
		expect(fkListDiff([a, b], [b, c])).toEqual({ missingLive: [a], missingDeclared: [c] });
	});

	it("compares all four fields and ignores extra properties", () => {
		const other = { ...a, parentColumn: "slug" };
		const withAction = { ...a, onDelete: "cascade" };
		expect(fkListDiff([withAction], [other])).toEqual({
			missingLive: [withAction],
			missingDeclared: [other],
		});
		expect(fkListDiff([withAction], [a])).toEqual({ missingLive: [], missingDeclared: [] });
	});
});
