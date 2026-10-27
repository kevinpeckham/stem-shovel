import { beforeEach, describe, expect, test } from "vite-plus/test";
import { reset } from "../../../tests/helpers/fakeDataLayer";

const { accountCounts, latestRecordingSession, recentProjects, recentSongs, recentUserIdeas } =
	await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const V = "user-two____________";
const at = (iso: string) => new Date(iso);

const session = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "practice",
	name: "",
	startsOn: "2026-10-17",
	place: "The Room",
	notes: "",
	eq: null,
	createdBy: U,
	createdAt: at("2026-10-17T00:00:00Z"),
	updatedAt: at("2026-10-17T00:00:00Z"),
	...over,
});
const recording = (
	id: string,
	accountId: string,
	sessionId: string,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	sessionId,
	title: id,
	recordedOn: "2026-10-17",
	status: "ready",
	filename: `${id}.m4a`,
	createdAt: at("2026-10-17T20:00:00Z"),
	...over,
});
const project = (
	id: string,
	accountId: string,
	day: number,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	name: `Project ${id}`,
	slug: id,
	imageUrl: null,
	isPrivate: false,
	isRestricted: false,
	status: "active",
	updatedAt: at(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`),
	...over,
});
const song = (
	id: string,
	accountId: string,
	projectId: string,
	day: number,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	projectId,
	title: `Song ${id}`,
	slug: id,
	isPrivate: false,
	status: "active",
	updatedAt: at(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`),
	...over,
});

beforeEach(() =>
	reset({
		recordingSession: [
			session("old", A, { startsOn: "2026-10-10" }),
			session("new", A, { createdAt: at("2026-10-17T01:00:00Z") }),
			session("same-day-earlier", A),
			session("b", B, { startsOn: "2026-10-30" }),
		],
		sessionRecording: [
			recording("r1", A, "new", { createdAt: at("2026-10-17T20:00:00Z") }),
			recording("r2", A, "new", { createdAt: at("2026-10-17T21:00:00Z"), title: "" }),
			recording("r3", A, "new", { status: "uploading" }),
			recording("rb", B, "b"),
		],
		project: [
			project("p1", A, 1),
			project("p2", A, 5),
			project("p3", A, 3),
			project("gone", A, 9, { status: "archived" }),
			project("pb", B, 20),
		],
		song: [
			song("s1", A, "p1", 2),
			song("s2", A, "p1", 6),
			song("s3", A, "p2", 4),
			song("s4", A, "p2", 8, { status: "archived" }),
			song("sb", B, "pb", 20),
		],
		accountMember: [
			{ id: "m1", accountId: A, userId: U, role: "owner" },
			{ id: "m2", accountId: A, userId: V, role: "member" },
			{ id: "m3", accountId: B, userId: U, role: "owner" },
		],
		idea: [
			{
				id: "i1",
				accountId: A,
				createdBy: U,
				title: "Riff",
				createdAt: at("2026-10-01T00:00:00Z"),
			},
			{ id: "i2", accountId: B, createdBy: U, title: "", createdAt: at("2026-10-03T00:00:00Z") },
			{
				id: "i3",
				accountId: A,
				createdBy: U,
				title: "Hook",
				createdAt: at("2026-10-02T00:00:00Z"),
			},
			{
				id: "iv",
				accountId: A,
				createdBy: V,
				title: "Theirs",
				createdAt: at("2026-10-09T00:00:00Z"),
			},
		],
	}),
);

describe("latestRecordingSession", () => {
	test("the account's newest session by day then creation, with its ready recordings counted", async () => {
		expect(await latestRecordingSession(A)).toMatchObject({
			id: "new",
			recordingCount: 2,
			newestRecording: "r2.m4a",
		});
	});
	test("scoped by account; null with none", async () => {
		expect((await latestRecordingSession(B))?.id).toBe("b");
		expect(await latestRecordingSession("nobody______________")).toBeNull();
	});
});

describe("recentProjects", () => {
	test("the account's active projects, most recently updated first, limited, with song counts", async () => {
		const rows = await recentProjects(A, 2);
		expect(rows.map((p) => p.id)).toEqual(["p2", "p3"]);
		expect(rows[0].songCount).toBe(1); // the archived song is not counted
		expect((await recentProjects(A, 10)).map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
		expect((await recentProjects(B, 10)).map((p) => p.id)).toEqual(["pb"]);
	});
});

describe("recentSongs", () => {
	test("the account's active songs, newest first, limited, with their project", async () => {
		const rows = await recentSongs(A, 2);
		expect(rows.map((s) => s.id)).toEqual(["s2", "s3"]);
		expect(rows[0].project).toMatchObject({ name: "Project p1", slug: "p1" });
		expect((await recentSongs(B, 5)).map((s) => s.id)).toEqual(["sb"]);
	});
});

describe("accountCounts", () => {
	test("projects, songs, ready recordings and members of the account only", async () => {
		expect(await accountCounts(A)).toEqual({ projects: 4, songs: 4, recordings: 2, members: 2 });
		expect(await accountCounts(B)).toEqual({ projects: 1, songs: 1, recordings: 1, members: 1 });
	});
});

describe("recentUserIdeas", () => {
	test("the user's own ideas across accounts, newest first, limited", async () => {
		expect((await recentUserIdeas(U, 2)).map((i) => i.id)).toEqual(["i2", "i3"]);
		expect((await recentUserIdeas(U, 5)).map((i) => i.id)).toEqual(["i2", "i3", "i1"]);
	});
});
