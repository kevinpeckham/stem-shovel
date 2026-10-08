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
vi.mock("$app/env", () => ({ dev: false, building: false, browser: false, version: "0" }));
vi.mock("#lib/server/db/index.js", () => ({ db: h.db, schema: h.schema }));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/email.js", () => h.email);
vi.mock("#lib/server/jobs.js", () => h.jobs);
vi.mock("#lib/server/notifications.js", () => h.notifications);
vi.mock("#lib/server/projectLifecycle.js", () => h.lifecycle);
vi.mock("#lib/server/relocate.js", () => h.relocate);
vi.mock("#lib/server/shortLinks.js", () => h.shortLinks);
vi.mock("#lib/server/blob.js", () => h.blob);
vi.mock("#lib/server/aiDetect.js", () => h.aiDetect);
vi.mock("#lib/server/rateLimit.js", () => h.rateLimit);
vi.mock("#lib/server/background.js", () => ({ background: h.background }));
vi.mock("#lib/server/markdown.js", () => ({ renderMarkdown: (md: string) => `<p>${md}</p>` }));
vi.mock("#lib/server/songMentions.js", () => ({
	withSongMentions: vi.fn(async (_account: string, _song: string, html: string) => html),
}));
vi.mock("#lib/auth.js", () => ({ auth: h.auth }));
vi.mock("#lib/server/supportChallenge.js", () => h.supportChallenge);
vi.mock("#lib/server/textToBeat.js", () => h.textToBeat);
vi.mock("#lib/server/textToChords.js", () => h.textToChords);

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
