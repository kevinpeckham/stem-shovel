import { vi, type Mock } from "vite-plus/test";
import type { GenericSchema } from "valibot";

/**
 * Stands in for `$app/server` so a remote function's handler runs in Node
 * (docs/testing.md). Importing this module registers the mock: `command`,
 * `query` and `form` validate the argument with the real valibot schema (a
 * bad payload throws, as in production) and call the handler, and
 * `getRequestEvent()` answers with whatever `setEvent()` last set. The
 * `as*` builders make `locals` in the shape src/hooks.server.ts produces
 * (src/app.d.ts) for the roles the access checks tell apart.
 *
 * Import the module's remote functions with `await import(...)` after this
 * helper (and tests/helpers/fakeServerModules.ts), as mix.test.ts does.
 */

export type FakeUser = NonNullable<App.Locals["user"]>;
export type FakeMembership = App.Locals["memberships"][number];

export interface FakeRequestEvent {
	locals: App.Locals;
	url: URL;
	cookies: { get: Mock; set: Mock; delete: Mock };
	request: Request;
	getClientAddress: () => string;
}

// The mock factory below closes over this; vi.hoisted keeps it above the hoisted vi.mock.
const state = vi.hoisted(() => ({ event: null as unknown }));

vi.mock("$app/server", async () => {
	const v = await import("valibot");
	type Handler = (arg: unknown, issue: unknown) => unknown;
	/** `invalid(issue.field("message"))` in a handler: the field proxy SvelteKit hands a form. */
	const issue = new Proxy(
		{},
		{ get: (_target, field) => (message: string) => ({ path: [field], message }) },
	);
	const parse = (schema: unknown, arg: unknown) =>
		schema && typeof schema === "object" ? v.parse(schema as GenericSchema, arg) : arg;
	// SvelteKit's remote-functions plugin checks every export for this brand.
	const wrap = (type: "command" | "query" | "form") => (schemaOrFn: unknown, maybeFn?: Handler) => {
		const fn = (maybeFn ?? schemaOrFn) as Handler;
		const schema = maybeFn ? schemaOrFn : undefined;
		const runner = (arg?: unknown) => Promise.resolve().then(() => fn(parse(schema, arg), issue));
		return Object.assign(runner, { __: { type, id: "", name: "" } });
	};
	return {
		command: wrap("command"),
		query: wrap("query"),
		form: wrap("form"),
		getRequestEvent: () => {
			if (!state.event)
				throw new Error("setEvent() (or an as* builder) before calling a remote function");
			return state.event as FakeRequestEvent;
		},
	};
});

/** A 21-character id valibot's `nanoid()` accepts, readable in a failure message. */
export const fakeId = (label: string) => label.padEnd(21, "_");

export const ACCOUNT = fakeId("acct-one");
export const OTHER_ACCOUNT = fakeId("acct-two");
export const USER = fakeId("user-one");
export const OTHER_USER = fakeId("user-two");

export function fakeUser(id = USER, overrides: Partial<FakeUser> = {}): FakeUser {
	return {
		id,
		name: "Test User",
		email: `${id.replace(/_+$/, "")}@example.com`,
		isSystemAdmin: false,
		isSuperAdmin: false,
		twoFactorEnabled: false,
		...overrides,
	};
}

export function fakeMembership(
	accountId: string,
	role = "member",
	overrides: Partial<FakeMembership> = {},
): FakeMembership {
	return {
		accountId,
		slug: `slug-${accountId.replace(/_+$/, "")}`,
		name: "Account",
		role,
		...overrides,
	};
}

/** Sets what `getRequestEvent()` answers: the locals and a plain POST request on the site. */
function setEvent(
	locals: App.Locals,
	extra: Partial<Omit<FakeRequestEvent, "locals">> = {},
): FakeRequestEvent {
	const event: FakeRequestEvent = {
		locals,
		url: new URL("http://localhost/"),
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
		request: new Request("http://localhost/_app/remote/test", { method: "POST" }),
		getClientAddress: () => "203.0.113.7",
		...extra,
	};
	state.event = event;
	return event;
}

/** Nobody is signed in: `locals.user` null, no memberships. */
export const asSignedOut = () => setEvent({ user: null, memberships: [] });

/** A signed-in user with the given memberships (none by default). */
export const asUser = (user: FakeUser = fakeUser(), memberships: FakeMembership[] = []) =>
	setEvent({ user, memberships });

/** A signed-in member of one account in a role: "owner", "admin", "member" or "viewer". */
export const asMemberOf = (
	accountId: string,
	role = "member",
	{ userId = USER, actingAs }: { userId?: string; actingAs?: boolean } = {},
) => asUser(fakeUser(userId), [fakeMembership(accountId, role, actingAs ? { actingAs } : {})]);

/** A member who may change things (src/lib/server/access.ts isEditor): a plain member by default. */
export const asEditorOf = (accountId: string, role: "owner" | "admin" | "member" = "member") =>
	asMemberOf(accountId, role);
export const asAdminOf = (accountId: string) => asMemberOf(accountId, "admin");
export const asOwnerOf = (accountId: string) => asMemberOf(accountId, "owner");
/** A member in the viewer role: sees the account's work, edits nothing. */
export const asViewerOf = (accountId: string) => asMemberOf(accountId, "viewer");
/** A signed-in person who belongs to some other account only. */
export const asOutsider = (userId = OTHER_USER) => asMemberOf(OTHER_ACCOUNT, "member", { userId });

/** The operator (user.isSystemAdmin), with no memberships unless given. */
export const asSystemAdmin = (memberships: FakeMembership[] = []) =>
	asUser(fakeUser(fakeId("sysadmin"), { isSystemAdmin: true }), memberships);
/** A super admin (isSuperAdmin and isSystemAdmin), with no memberships unless given. */
export const asSuperAdmin = (memberships: FakeMembership[] = []) =>
	asUser(fakeUser(fakeId("superadmin"), { isSystemAdmin: true, isSuperAdmin: true }), memberships);

/** The last event set, to add cookies or a URL to. */
export const currentEvent = () => state.event as FakeRequestEvent;

/**
 * Calls a remote function's handler through the mock. A `form` is typed as
 * an object (RemoteForm), not a function, so every call goes through here.
 */
export const call = (fn: object, input?: unknown): Promise<unknown> =>
	(fn as (arg?: unknown) => Promise<unknown>)(input);

/** `rejects.toMatchObject(httpError(404))`: an HttpError thrown by SvelteKit's `error()`. */
export const httpError = (status: number) => ({ status });
/** A `redirect()` thrown on success. */
export const redirected = (location?: string) =>
	location ? { status: 303, location } : { status: 303 };
