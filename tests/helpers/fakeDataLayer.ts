import { vi } from "vite-plus/test";

/**
 * The wiring a test of `src/lib/server/data.ts` needs, registered by
 * importing this module before `await import("$lib/server/data")`
 * (docs/testing.md): the database is `fakeDb` (rows per table, a `calls`
 * log), Blob is a double whose pathname helpers are the pure parts written
 * out, and the cascade (`src/lib/server/cascade.ts`) is a set of `vi.fn()`
 * so a delete's hand-off can be asserted without running it. Everything
 * else data.ts imports (slugAlias, relocate, markdown) runs for real
 * against the fake. `reset()` in a `beforeEach` reloads the tables and
 * clears every mock.
 */
const h = await vi.hoisted(async () => {
	const ext = (filename: string) => (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
	return {
		fake: (await import("./fakeDb")).fakeDb(),
		blob: {
			presentUrl: vi.fn(async (url: string | null | undefined) => url ?? null),
			deleteBlobs: vi.fn(async () => {}),
			copyBlob: vi.fn(async (_url: string, to: string) => `https://blob/${to}`),
			recordingAccess: vi.fn(() => "private" as const),
			stemPathname: (
				accountId: string,
				songId: string,
				stemId: string,
				filename: string,
				version = 0,
			) =>
				`accounts/${accountId}/songs/${songId}/${version > 0 ? `${stemId}-v${version}` : stemId}.${ext(filename)}`,
			demoPathname: (accountId: string, songId: string, demoId: string, filename: string) =>
				`accounts/${accountId}/songs/${songId}/demos/${demoId}.${ext(filename)}`,
			studioSourcePathname: (
				accountId: string,
				ideaId: string,
				sourceId: string,
				filename: string,
			) => `accounts/${accountId}/studio/${ideaId}/${sourceId}.${ext(filename)}`,
			filePathname: (accountId: string, songId: string, fileId: string, filename: string) =>
				`accounts/${accountId}/songs/${songId}/files/${fileId}.${ext(filename)}`,
			projectFilePathname: (
				accountId: string,
				projectId: string,
				fileId: string,
				filename: string,
			) => `accounts/${accountId}/projects/${projectId}/files/${fileId}.${ext(filename)}`,
			notationPathname: (accountId: string, songId: string, notationId: string, filename: string) =>
				`accounts/${accountId}/songs/${songId}/notation/${notationId}.${ext(filename)}`,
			midiPathname: (accountId: string, songId: string, stemId: string, filename: string) =>
				`accounts/${accountId}/songs/${songId}/midi/${stemId}.${ext(filename)}`,
			recordingPathname: (accountId: string, recordingId: string, filename: string) =>
				`accounts/${accountId}/recordings/${recordingId}.${ext(filename)}`,
			recordingStemPathname: (
				accountId: string,
				recordingId: string,
				stemId: string,
				filename: string,
			) => `accounts/${accountId}/recordings/${recordingId}/${stemId}.${ext(filename)}`,
		},
		cascade: {
			deleteAccountRows: vi.fn(async (_accountId: string) => {}),
			deleteArtistRows: vi.fn(async (_ids: string[]) => {}),
			deleteBugReportRows: vi.fn(async (_ids: string[]) => {}),
			deleteIdeaRows: vi.fn(async (_ids: string[]) => {}),
			deleteSongRows: vi.fn(async (_ids: string[]) => {}),
			deleteUserDocRows: vi.fn(async (_ids: string[]) => {}),
			deleteUserRows: vi.fn(async (_userId: string) => {}),
		},
	};
});
vi.mock("$lib/server/db", async () => ({
	db: h.fake,
	schema: await import("$lib/server/db/schema"),
}));
vi.mock("$lib/server/blob", () => h.blob);
vi.mock("$lib/server/cascade", () => h.cascade);

export const fake = h.fake;
export const blob = h.blob;
export const cascade = h.cascade;

/** Reloads the tables from `fixtures` and clears the Blob and cascade doubles. */
export function reset(fixtures: Parameters<typeof fake.reset>[0] = {}) {
	fake.reset(fixtures);
	for (const fn of [...Object.values(blob), ...Object.values(cascade)])
		if (vi.isMockFunction(fn)) fn.mockClear();
}

/** The logged writes of one kind to a table, in order. */
export const callsTo = (op: "insert" | "update" | "delete" | "select", table: string) =>
	fake.calls.filter((c) => c.op === op && c.table === table);
