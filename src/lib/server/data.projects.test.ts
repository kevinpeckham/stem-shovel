import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "#lib/val/InviteCodeSchema.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	addProjectMember,
	createProject,
	createShareLink,
	listProjectPeople,
	listShareLinks,
	openShareLinks,
	permalinkTarget,
	projectIsPrivate,
	projectOfSong,
	projectRestricted,
	projectRoleOf,
	projectRolesOf,
	projectSlugs,
	removeProjectPerson,
	reorderSongs,
	revokeShareLink,
	setProjectPrivacy,
	setProjectRestricted,
	setSongPrivacy,
	shareLinkTarget,
	songSlugs,
	updateProject,
	useShareLink,
} = await import("./data");

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms: number) => new Date(ms);
const a1 = { id: "a1", name: "Band", slug: "band" };
const p1 = { id: "p1", accountId: "a1", name: "Album", slug: "album", type: "album" };
const s1 = { id: "s1", accountId: "a1", projectId: "p1", title: "One", slug: "one" };
const u1 = { id: "u1", name: "Ann", email: "ann@example.com" };
const u2 = { id: "u2", name: "Bob", email: "bob@example.com" };
const aliases = () => fake.rows("slugAlias").map((r) => [r.kind, r.scopeId, r.slug, r.targetId]);

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reset({ account: [a1], project: [p1], song: [s1], user: [u1, u2] }));

describe("createProject", () => {
	test("a slug from the name, unique within the account; the live slug drops any alias", async () => {
		reset({
			project: [p1, { ...p1, id: "p2", slug: "album-2", accountId: "a2" }],
			slugAlias: [{ kind: "project", scopeId: "a1", slug: "album-2", targetId: "old" }],
		});
		const made = await createProject("a1", "u1", "  Album ");
		expect(made).toMatchObject({
			accountId: "a1",
			name: "Album",
			slug: "album-2",
			createdBy: "u1",
			status: "active",
		});
		expect(aliases()).toEqual([]);
		expect((await createProject("a1", "u1", "!!!")).slug).toBe("project");
	});
});

describe("updateProject", () => {
	test("renames, re-slugs and re-types; the old slug becomes an alias", async () => {
		const result = await updateProject("a1", "p1", { name: " LP ", slug: "lp", type: "ep" });
		expect(result).toMatchObject({ ok: true, project: { name: "LP", slug: "lp", type: "ep" } });
		expect(aliases()).toEqual([["project", "a1", "album", "p1"]]);
	});
	test("a slug another project of the account uses is refused; the project's own is fine", async () => {
		reset({
			project: [
				p1,
				{ ...p1, id: "p2", slug: "lp" },
				{ ...p1, id: "p3", slug: "x", accountId: "a2" },
			],
		});
		expect(await updateProject("a1", "p1", { name: "A", slug: "lp", type: "album" })).toEqual({
			ok: false,
			field: "slug",
			error: "Another project already uses /projects/lp.",
		});
		expect(await updateProject("a1", "p1", { name: "A", slug: "x", type: "album" })).toMatchObject({
			ok: true,
		});
		expect((await updateProject("a1", "p1", { name: "A", slug: "x", type: "album" })).ok).toBe(
			true,
		);
		expect(aliases()).toEqual([["project", "a1", "album", "p1"]]);
	});
	test("an empty name, a bad slug and another account's project are errors", async () => {
		expect(await updateProject("a1", "p1", { name: " ", slug: "a", type: "album" })).toEqual({
			ok: false,
			field: "name",
			error: "Give the project a name.",
		});
		expect(
			await updateProject("a1", "p1", { name: "A", slug: "Bad Slug", type: "album" }),
		).toMatchObject({ ok: false, field: "slug" });
		expect(await updateProject("a2", "p1", { name: "A", slug: "a", type: "album" })).toEqual({
			ok: false,
			field: "name",
			error: "Project not found.",
		});
		expect(callsTo("update", "project")).toHaveLength(1);
		expect(fake.rows("project")[0].slug).toBe("album");
	});
});

describe("projectSlugs, projectOfSong, songSlugs, projectIsPrivate", () => {
	test("each answers through the account, and null across it", async () => {
		expect(await projectSlugs("a1", "p1")).toEqual({
			account: "band",
			project: "album",
			projectName: "Album",
		});
		expect(await projectSlugs("a2", "p1")).toBeNull();
		expect(await projectOfSong("a1", "s1")).toEqual({ projectId: "p1" });
		expect(await projectOfSong("a2", "s1")).toBeNull();
		expect(await songSlugs("a1", "s1")).toEqual({ account: "band", project: "album", song: "one" });
		expect(await songSlugs("a2", "s1")).toBeNull();
		reset({ project: [{ ...p1, isPrivate: true }] });
		expect(await projectIsPrivate("a1", "p1")).toBe(true);
		expect(await projectIsPrivate("a2", "p1")).toBeNull();
	});
});

describe("reorderSongs", () => {
	test("named songs first in that order, the rest after in their old order; only changed rows are written", async () => {
		reset({
			song: [
				{ ...s1, id: "s1", sortOrder: 0, title: "A" },
				{ ...s1, id: "s2", sortOrder: 1, title: "B" },
				{ ...s1, id: "s3", sortOrder: 2, title: "C" },
				{ ...s1, id: "other", sortOrder: 0, projectId: "p2" },
			],
		});
		expect(await reorderSongs("a1", "p1", ["s3", "other", "nope", "s1"])).toEqual([
			"s3",
			"s1",
			"s2",
		]);
		expect(callsTo("update", "song").map((c) => c.values)).toEqual([
			{ sortOrder: 0 },
			{ sortOrder: 1 },
			{ sortOrder: 2 },
		]);
		expect(fake.rows("song").map((s) => [s.id, s.sortOrder])).toEqual([
			["s1", 1],
			["s2", 2],
			["s3", 0],
			["other", 0],
		]);
	});
	test("another account's project reorders nothing", async () => {
		expect(await reorderSongs("a2", "p1", ["s1"])).toEqual([]);
		expect(callsTo("update", "song")).toEqual([]);
	});
});

describe("projectRolesOf, projectRoleOf, projectRestricted", () => {
	test("roles per project of the account; a role on one project; the restricted flag (false when unknown)", async () => {
		reset({
			project: [p1, { ...p1, id: "p2", isRestricted: true }, { ...p1, id: "px", accountId: "a2" }],
			projectMember: [
				{ projectId: "p1", userId: "u1", role: "member" },
				{ projectId: "p2", userId: "u1", role: "viewer" },
				{ projectId: "px", userId: "u1", role: "member" },
				{ projectId: "p1", userId: "u2", role: "viewer" },
			],
		});
		expect(await projectRolesOf("a1", "u1")).toEqual({ p1: "member", p2: "viewer" });
		expect(await projectRolesOf("a1", "u3")).toEqual({});
		expect(await projectRoleOf("p1", "u2")).toBe("viewer");
		expect(await projectRoleOf("p2", "u2")).toBeNull();
		expect(await projectRestricted("p2")).toBe(true);
		expect(await projectRestricted("p1")).toBe(false);
		expect(await projectRestricted("nope")).toBe(false);
	});
});

describe("listProjectPeople", () => {
	test("everyone on the project in order added, and the open, unexpired viewer invitations newest first", async () => {
		reset({
			project: [p1],
			user: [u1, u2],
			projectMember: [
				{ projectId: "p1", userId: "u2", role: "viewer", createdAt: at(2) },
				{ projectId: "p1", userId: "u1", role: "member", createdAt: at(1) },
				{ projectId: "p2", userId: "u1", role: "member", createdAt: at(0) },
			],
			invitation: [
				{ id: "i1", projectId: "p1", email: "a@e.com", expiresAt: at(NOW + 1), createdAt: at(1) },
				{ id: "i2", projectId: "p1", email: "b@e.com", expiresAt: at(NOW + 1), createdAt: at(2) },
				{ id: "i3", projectId: "p1", email: "c@e.com", expiresAt: at(NOW - 1), createdAt: at(3) },
				{ id: "i4", projectId: "p1", email: "d@e.com", expiresAt: at(NOW + 1), acceptedAt: at(1) },
				{ id: "i5", projectId: "p1", email: "e@e.com", expiresAt: at(NOW + 1), revokedAt: at(1) },
				{ id: "i6", projectId: "p2", email: "f@e.com", expiresAt: at(NOW + 1) },
			],
		});
		expect(await listProjectPeople("a1", "p1")).toEqual({
			people: [
				{ userId: "u1", name: "Ann", email: "ann@example.com", role: "member", since: at(1) },
				{ userId: "u2", name: "Bob", email: "bob@example.com", role: "viewer", since: at(2) },
			],
			invitations: [
				{ id: "i2", email: "b@e.com", expiresAt: at(NOW + 1), createdAt: at(2) },
				{ id: "i1", email: "a@e.com", expiresAt: at(NOW + 1), createdAt: at(1) },
			],
		});
		expect(await listProjectPeople("a2", "p1")).toEqual({ people: [], invitations: [] });
	});
});

describe("addProjectMember", () => {
	const members = (role: string) => ({
		project: [p1],
		accountMember: [{ accountId: "a1", userId: "u2", role }],
	});
	test("adds an account member; a viewer already there is raised to member; a member already there is 'already'", async () => {
		reset(members("member"));
		expect(await addProjectMember("a1", "p1", "u2", "u1")).toEqual({ ok: true, already: false });
		expect(callsTo("insert", "project_member")[0].values).toEqual({
			projectId: "p1",
			userId: "u2",
			role: "member",
			addedBy: "u1",
		});
		expect(await addProjectMember("a1", "p1", "u2", "u1")).toEqual({ ok: true, already: true });
		reset({
			...members("member"),
			projectMember: [{ id: "pm", projectId: "p1", userId: "u2", role: "viewer" }],
		});
		expect(await addProjectMember("a1", "p1", "u2", "u1")).toEqual({ ok: true, already: false });
		expect(fake.rows("projectMember")).toHaveLength(1);
		expect(fake.rows("projectMember")[0].role).toBe("member");
	});
	test("refused for another account's project, a non-member, and an owner or admin", async () => {
		reset(members("member"));
		expect(await addProjectMember("a2", "p1", "u2", "u1")).toEqual({
			ok: false,
			error: "Project not found.",
		});
		expect(await addProjectMember("a1", "p1", "u3", "u1")).toEqual({
			ok: false,
			error: "Not a member of this account.",
		});
		reset(members("admin"));
		expect(await addProjectMember("a1", "p1", "u2", "u1")).toEqual({
			ok: false,
			error: "Owners and admins are on every project already.",
		});
		expect(callsTo("insert", "project_member")).toEqual([]);
	});
});

describe("removeProjectPerson, setProjectRestricted, setProjectPrivacy, setSongPrivacy", () => {
	test("each writes within the account and answers false across it", async () => {
		reset({
			project: [p1],
			song: [s1],
			projectMember: [{ id: "pm", projectId: "p1", userId: "u2", role: "viewer" }],
		});
		expect(await removeProjectPerson("a2", "p1", "u2")).toBe(false);
		expect(await removeProjectPerson("a1", "p1", "u9")).toBe(false);
		expect(await removeProjectPerson("a1", "p1", "u2")).toBe(true);
		expect(fake.rows("projectMember")).toEqual([]);
		expect(await setProjectRestricted("a1", "p1", true)).toBe(true);
		expect(await setProjectRestricted("a2", "p1", true)).toBe(false);
		expect(await setProjectPrivacy("a1", "p1", true)).toBe(true);
		expect(await setProjectPrivacy("a2", "p1", true)).toBe(false);
		expect(fake.rows("project")[0]).toMatchObject({ isRestricted: true, isPrivate: true });
		expect(await setSongPrivacy("a1", "s1", true)).toBe(true);
		expect(await setSongPrivacy("a2", "s1", false)).toBe(false);
		expect(fake.rows("song")[0].isPrivate).toBe(true);
	});
});

const link = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	projectId: null,
	songId: "s1",
	code: id.toUpperCase().padEnd(INVITE_CODE_LENGTH, "X"),
	note: "",
	createdBy: "u1",
	expiresAt: null,
	maxUses: null,
	uses: 0,
	revokedAt: null,
	createdAt: at(NOW),
	...over,
});

describe("createShareLink", () => {
	test("a code for a song or a project, expiring in the days asked (0 = never)", async () => {
		const forSong = await createShareLink(
			"a1",
			"u1",
			{ songId: "s1" },
			{ note: "mix 2", maxUses: 5, expiresDays: 30 },
		);
		expect(forSong).toMatchObject({
			accountId: "a1",
			songId: "s1",
			projectId: null,
			note: "mix 2",
			createdBy: "u1",
			maxUses: 5,
			uses: 0,
			expiresAt: at(NOW + 30 * 86_400_000),
			revokedAt: null,
		});
		expect(forSong.code).toMatch(new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`));
		const forProject = await createShareLink(
			"a1",
			"u1",
			{ projectId: "p1" },
			{ note: "", maxUses: null, expiresDays: 0 },
		);
		expect(forProject).toMatchObject({
			songId: null,
			projectId: "p1",
			maxUses: null,
			expiresAt: null,
		});
	});
});

describe("listShareLinks, revokeShareLink, openShareLinks", () => {
	beforeEach(() =>
		reset({
			user: [u1],
			shareLink: [
				link("l1", { createdAt: at(1) }),
				link("l2", { createdAt: at(2), revokedAt: at(1) }),
				link("l3", { createdAt: at(3), expiresAt: at(NOW - 1) }),
				link("l4", { createdAt: at(4), maxUses: 1, uses: 1 }),
				link("l5", { songId: null, projectId: "p1" }),
				link("l6", { accountId: "a2", songId: "s9" }),
			],
		}),
	);
	test("a song's (or a project's) links newest first with their state and maker", async () => {
		expect(
			(await listShareLinks({ songId: "s1" })).map((l) => [l.id, l.state, l.creator?.name]),
		).toEqual([
			["l4", "used up", "Ann"],
			["l3", "expired", "Ann"],
			["l2", "revoked", "Ann"],
			["l1", "open", "Ann"],
		]);
		expect((await listShareLinks({ projectId: "p1" })).map((l) => l.id)).toEqual(["l5"]);
	});
	test("revoking is scoped to the account", async () => {
		expect(await revokeShareLink("a1", "l6")).toBe(false);
		expect(await revokeShareLink("a1", "l1")).toBe(true);
		expect(fake.rows("shareLink")[0].revokedAt).toEqual(at(NOW));
	});
	test("of the codes a visitor carries, the open ones and what each opens; no codes asks nothing", async () => {
		const codes = ["l1", "l2", "l3", "l4", "l5", "l6", "nope"].map((id) => link(id).code);
		expect(await openShareLinks(codes)).toEqual([
			{ code: link("l1").code, projectId: null, songId: "s1" },
			{ code: link("l5").code, projectId: "p1", songId: null },
			{ code: link("l6").code, projectId: null, songId: "s9" },
		]);
		expect(await openShareLinks([])).toEqual([]);
		expect(fake.calls.filter((c) => c.table === "share_link")).toHaveLength(1);
	});
});

describe("permalinkTarget, shareLinkTarget", () => {
	test("the current page of a song, project or account by id, through the slugs they have now", async () => {
		expect(await permalinkTarget("song", "s1")).toBe("/band/projects/album/one");
		expect(await permalinkTarget("project", "p1")).toBe("/band/projects/album");
		expect(await permalinkTarget("account", "a1")).toBe("/band");
		expect(await permalinkTarget("song", "nope")).toBeNull();
		expect(await permalinkTarget("project", "nope")).toBeNull();
		expect(await permalinkTarget("account", "nope")).toBeNull();
	});
	test("a code's song or project page; null for an unknown code or a target that is gone", async () => {
		reset({
			account: [a1],
			project: [p1],
			song: [s1],
			shareLink: [
				link("l1"),
				link("l2", { songId: null, projectId: "p1" }),
				link("l3", { songId: "gone" }),
			],
		});
		expect(await shareLinkTarget(link("l1").code)).toBe("/band/projects/album/one");
		expect(await shareLinkTarget(link("l2").code)).toBe("/band/projects/album");
		expect(await shareLinkTarget(link("l3").code)).toBeNull();
		expect(await shareLinkTarget("NOPE")).toBeNull();
	});
});

describe("useShareLink", () => {
	test("counts a use on that code alone", async () => {
		reset({ shareLink: [link("l1", { uses: 2 }), link("l2")] });
		await useShareLink(link("l1").code);
		expect(fake.rows("shareLink").map((l) => l.uses)).toEqual([3, 0]);
		await useShareLink("NOPE");
		expect(fake.rows("shareLink").map((l) => l.uses)).toEqual([3, 0]);
	});
});
