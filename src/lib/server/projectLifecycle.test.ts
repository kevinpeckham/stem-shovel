import { describe, expect, test, vi } from "vite-plus/test";

/** A drizzle stand-in: findFirst answers the status; select answers rows per table; delete records itself. */
const fake = vi.hoisted(() => {
	const state = {
		status: null as null | "active" | "archived",
		rows: {} as Record<string, unknown[]>,
		deleted: [] as string[],
	};
	const db = {
		query: {
			project: {
				findFirst: vi.fn(async () => (state.status ? { status: state.status } : undefined)),
			},
		},
		select: () => ({
			from: (table: { name: string }) => ({ where: async () => state.rows[table.name] ?? [] }),
		}),
		delete: (table: { name: string }) => ({
			where: () => ({
				returning: async () => {
					state.deleted.push(table.name);
					return [{ id: "p1" }];
				},
			}),
		}),
	};
	const col = (name: string) => ({ name, table: name });
	const schema = {
		project: { name: "project", accountId: col("accountId"), id: col("id"), status: col("status") },
		song: {
			name: "song",
			accountId: col("accountId"),
			projectId: col("projectId"),
			id: col("id"),
			mixUrl: col("mixUrl"),
		},
		stem: {
			name: "stem",
			songId: col("songId"),
			url: col("url"),
			playbackUrl: col("playbackUrl"),
			midiUrl: col("midiUrl"),
		},
		demo: { name: "demo", songId: col("songId"), url: col("url"), playbackUrl: col("playbackUrl") },
	};
	return { state, db, schema, deleteBlobs: vi.fn(async () => {}) };
});
vi.mock("$lib/server/db", () => ({ db: fake.db, schema: fake.schema }));
vi.mock("$lib/server/blob", () => ({ deleteBlobs: fake.deleteBlobs }));
vi.mock("drizzle-orm", () => ({
	and: (...a: unknown[]) => a,
	eq: (a: unknown, b: unknown) => [a, b],
	asc: (a: unknown) => a,
	inArray: (a: unknown, b: unknown) => [a, b],
}));

const { deleteProject } = await import("./projectLifecycle");

describe("deleteProject", () => {
	test("a project that is not there is missing", async () => {
		fake.state.status = null;
		expect(await deleteProject("a1", "p1")).toBe("missing");
		expect(fake.deleteBlobs).not.toHaveBeenCalled();
	});
	test("an active project is refused: archive it first", async () => {
		fake.state.status = "active";
		expect(await deleteProject("a1", "p1")).toBe("active");
		expect(fake.deleteBlobs).not.toHaveBeenCalled();
		expect(fake.state.deleted).toEqual([]);
	});
	test("an archived project goes with every file behind its songs", async () => {
		fake.state.status = "archived";
		fake.state.rows = {
			song: [{ id: "s1", mixUrl: "mix1" }],
			stem: [{ url: "st1", playbackUrl: "pl1", midiUrl: null }],
			demo: [{ url: "d1", playbackUrl: null }],
		};
		expect(await deleteProject("a1", "p1")).toBe("deleted");
		expect(fake.deleteBlobs).toHaveBeenCalledWith(["st1", "pl1", "", "d1", "", "mix1"]);
		expect(fake.state.deleted).toEqual(["project"]);
	});
});
