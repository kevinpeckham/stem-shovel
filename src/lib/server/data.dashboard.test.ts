import { beforeEach, describe, expect, test } from "vite-plus/test";
import { reset } from "../../../tests/helpers/fakeDataLayer";

const { accountCounts, recentRecordingSessions, recentProjects, recentSongs, recentUserIdeas } =
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
	stage: null,
	isFinished: false,
	createdAt: at("2026-09-01T00:00:00Z"),
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
			song("s3", A, "p2", 4, { stage: "finished", isFinished: true }),
			song("s4", A, "p2", 8, { status: "archived" }),
			song("sb", B, "pb", 20),
		],
		stem: [
			{ id: "st1", accountId: A, songId: "s2", status: "ready" },
			{ id: "st2", accountId: A, songId: "s3", status: "uploading" },
		],
		songMix: [
			{ id: "mx1", accountId: A, songId: "s2", status: "ready" },
			{ id: "mx2", accountId: A, songId: "s3", status: "failed" },
		],
		demo: [
			{ id: "d1", accountId: A, songId: "s2", status: "ready" },
			{ id: "d2", accountId: A, songId: "s2", status: "ready" },
			{ id: "d3", accountId: A, songId: "s3", status: "failed" },
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
				kind: "idea",
				title: "Riff",
				createdAt: at("2026-10-01T00:00:00Z"),
			},
			{
				id: "i2",
				accountId: B,
				createdBy: U,
				kind: "idea",
				title: "",
				createdAt: at("2026-10-03T00:00:00Z"),
			},
			{
				id: "i3",
				accountId: A,
				createdBy: U,
				kind: "idea",
				title: "Hook",
				createdAt: at("2026-10-02T00:00:00Z"),
			},
			{
				id: "iv",
				accountId: A,
				createdBy: V,
				kind: "idea",
				title: "Theirs",
				createdAt: at("2026-10-09T00:00:00Z"),
			},
			{
				id: "l1",
				accountId: A,
				createdBy: U,
				kind: "loop",
				title: "Loop",
				createdAt: at("2026-10-10T00:00:00Z"),
			},
			{
				id: "d1",
				accountId: B,
				createdBy: U,
				kind: "song",
				title: "Dawn song",
				createdAt: at("2026-10-11T00:00:00Z"),
			},
		],
	}),
);

describe("recentRecordingSessions", () => {
	test("the account's newest sessions by day then creation, limited, with their ready recordings counted", async () => {
		const rows = await recentRecordingSessions(A, 2);
		expect(rows.map((s) => s.id)).toEqual(["new", "same-day-earlier"]);
		expect(rows[0].recordingCount).toBe(2);
		expect(rows[1].recordingCount).toBe(0);
		expect((await recentRecordingSessions(A, 10)).map((s) => s.id)).toEqual([
			"new",
			"same-day-earlier",
			"old",
		]);
	});
	test("scoped by account; empty with none", async () => {
		expect((await recentRecordingSessions(B, 6)).map((s) => s.id)).toEqual(["b"]);
		expect(await recentRecordingSessions("nobody______________", 6)).toEqual([]);
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

	test("with the stage fields, the ready stem and demo counts, and whether a ready stem and mix exist", async () => {
		const rows = await recentSongs(A, 5);
		expect(
			rows.map(({ id, stage, isFinished, stemCount, demoCount, hasStem, hasMix }) => ({
				id,
				stage,
				isFinished,
				stemCount,
				demoCount,
				hasStem,
				hasMix,
			})),
		).toEqual([
			{
				id: "s2",
				stage: null,
				isFinished: false,
				stemCount: 1,
				demoCount: 2,
				hasStem: true,
				hasMix: true,
			},
			{
				id: "s3",
				stage: "finished",
				isFinished: true,
				stemCount: 0,
				demoCount: 0,
				hasStem: false,
				hasMix: false,
			},
			{
				id: "s1",
				stage: null,
				isFinished: false,
				stemCount: 0,
				demoCount: 0,
				hasStem: false,
				hasMix: false,
			},
		]);
		expect(rows[0].createdAt).toEqual(at("2026-09-01T00:00:00Z"));
		expect(rows[0]).not.toHaveProperty("stems");
		expect(rows[0]).not.toHaveProperty("mixes");
		expect(rows[0]).not.toHaveProperty("demos");
	});
});

describe("accountCounts", () => {
	test("projects, songs, sessions, ready recordings and members of the account only", async () => {
		expect(await accountCounts(A)).toEqual({
			projects: 4,
			songs: 4,
			sessions: 3,
			recordings: 2,
			members: 2,
		});
		expect(await accountCounts(B)).toEqual({
			projects: 1,
			songs: 1,
			sessions: 1,
			recordings: 1,
			members: 1,
		});
	});
});

describe("recentUserIdeas", () => {
	test("the user's own ideas of one kind across accounts, newest first, limited", async () => {
		expect((await recentUserIdeas(U, "idea", 2)).map((i) => i.id)).toEqual(["i2", "i3"]);
		expect((await recentUserIdeas(U, "idea", 5)).map((i) => i.id)).toEqual(["i2", "i3", "i1"]);
		expect((await recentUserIdeas(U, "loop", 5)).map((i) => i.id)).toEqual(["l1"]);
		expect((await recentUserIdeas(U, "song", 5)).map((i) => i.id)).toEqual(["d1"]);
		expect((await recentUserIdeas(U, "idea", 500)).map((i) => i.id)).toEqual(["i2", "i3", "i1"]);
		expect(await recentUserIdeas(V, "loop", 5)).toEqual([]);
	});
});
