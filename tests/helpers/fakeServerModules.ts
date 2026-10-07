import { vi, type Mock } from "vite-plus/test";

/**
 * Doubles for everything a remote function reaches below the access checks,
 * registered by importing this module (docs/testing.md): the database (so
 * `src/lib/server/access.ts` runs for real against rows a test provides),
 * the data layer, Blob, mail, jobs, notifications and the rate limiter.
 * Every function of the data layer (and of the mail, jobs, notification,
 * lifecycle, relocate and short-link modules) is a `vi.fn()` made on first
 * use, so a test sets what it needs and asserts what was called with what.
 *
 * `resetRemoteMocks()` in a `beforeEach` clears every mock and restores the
 * data defaults the viewing checks need (no share grants, no project roles).
 */

export type Mocks = Record<string, Mock>;
export interface FakeTable {
	findFirst: Mock;
	findMany: Mock;
}

const h = vi.hoisted(() => {
	const skip = (key: PropertyKey) =>
		typeof key !== "string" || key === "then" || key === "__esModule" || key === "default";
	/** A module whose every named export is a vi.fn() made on first access; `fixed` names keep real functions. */
	const autoMock = (fixed: Record<string, unknown> = {}) => {
		const fns = new Map<string, unknown>(Object.entries(fixed));
		return new Proxy(fns, {
			get(map, key) {
				if (skip(key)) return undefined;
				if (!map.has(key)) map.set(key, vi.fn());
				return map.get(key);
			},
			has: (_map, key) => !skip(key),
		}) as unknown as Mocks;
	};
	const tables = new Map<string, FakeTable>();
	const db = {
		query: new Proxy(tables, {
			get(map, table) {
				if (skip(table)) return undefined;
				if (!map.has(table)) map.set(table, { findFirst: vi.fn(), findMany: vi.fn() });
				return map.get(table);
			},
		}) as unknown as Record<string, FakeTable>,
	};
	/** `schema.song.id` and the like: drizzle's `eq()` stores whatever it is handed until a query runs, which none does here. */
	const schema = new Proxy(
		{},
		{
			get: (_target, table) =>
				skip(table) ? undefined : new Proxy({}, { get: (_t, column) => ({ table, column }) }),
		},
	);
	return {
		db,
		schema,
		env: {} as Record<string, string | undefined>,
		data: autoMock(),
		email: autoMock(),
		jobs: autoMock(),
		notifications: autoMock(),
		lifecycle: autoMock(),
		relocate: autoMock(),
		shortLinks: autoMock(),
		blob: autoMock({
			isRecordingPathname: (pathname: string) => pathname.includes("/recordings/"),
			imagePathname: (kind: string, accountId: string, id: string, ext: string) =>
				`accounts/${accountId}/${kind}/${id}.${ext}`,
		}),
		aiDetect: autoMock({ aiAvailable: vi.fn(() => true) }),
		rateLimit: { rateLimited: vi.fn(async () => false), MINUTE: 60_000, HOUR: 3_600_000 },
		background: vi.fn(),
		auth: { api: { signOut: vi.fn() } },
		supportChallenge: autoMock(),
		textToBeat: autoMock(),
		textToChords: autoMock(),
	};
});

vi.mock("varlock/env", () => ({ ENV: h.env, initVarlockEnv: () => {} }));
vi.mock("$app/environment", () => ({ dev: false, building: false, browser: false, version: "0" }));
vi.mock("$lib/server/db", () => ({ db: h.db, schema: h.schema }));
vi.mock("$lib/server/data", () => h.data);
vi.mock("$lib/server/email", () => h.email);
vi.mock("$lib/server/jobs", () => h.jobs);
vi.mock("$lib/server/notifications", () => h.notifications);
vi.mock("$lib/server/projectLifecycle", () => h.lifecycle);
vi.mock("$lib/server/relocate", () => h.relocate);
vi.mock("$lib/server/shortLinks", () => h.shortLinks);
vi.mock("$lib/server/blob", () => h.blob);
vi.mock("$lib/server/aiDetect", () => h.aiDetect);
vi.mock("$lib/server/rateLimit", () => h.rateLimit);
vi.mock("$lib/server/background", () => ({ background: h.background }));
vi.mock("$lib/server/markdown", () => ({ renderMarkdown: (md: string) => `<p>${md}</p>` }));
vi.mock("$lib/server/songMentions", () => ({
	withSongMentions: vi.fn(async (_account: string, _song: string, html: string) => html),
}));
vi.mock("$lib/auth", () => ({ auth: h.auth }));
vi.mock("$lib/server/supportChallenge", () => h.supportChallenge);
vi.mock("$lib/server/textToBeat", () => h.textToBeat);
vi.mock("$lib/server/textToChords", () => h.textToChords);

const fakeDb = h.db;
export const data = h.data;
export const email = h.email;
export const jobs = h.jobs;
export const notifications = h.notifications;
export const lifecycle = h.lifecycle;
export const shortLinks = h.shortLinks;
export const blob = h.blob;
export const aiDetect = h.aiDetect;
export const rateLimited = h.rateLimit.rateLimited;
export const background = h.background;
export const supportChallenge = h.supportChallenge;

/** The row access.ts finds for an entity: `givenRow("song", { accountId: ACCOUNT })`. */
export function givenRow(table: string, row: Record<string, unknown> | null) {
	fakeDb.query[table].findFirst.mockResolvedValue(row);
}

/** Clears every mock and restores the data defaults the viewing checks read. */
export function resetRemoteMocks() {
	vi.resetAllMocks();
	data.openShareLinks.mockResolvedValue([]);
	data.projectRolesOf.mockResolvedValue({});
	data.projectRoleOf.mockResolvedValue(null);
	data.projectRestricted.mockResolvedValue(false);
}
