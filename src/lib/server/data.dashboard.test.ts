import { beforeEach, describe, expect, test } from "vite-plus/test";
import { PLAN_LIMITS } from "#lib/constants/plans.js";
import { sessionDisplayName } from "#lib/utils/sessionName.js";
import { reset } from "../../../tests/helpers/fakeDataLayer";

const {
	accountActivity,
	accountBand,
	accountCounts,
	accountPendingWork,
	accountQuota,
	recentRecordingSessions,
	recentProjects,
	recentSongs,
	recentUserIdeas,
	unreadSessionChats,
	unreadSongChats,
} = await import("./data");

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
const message = (id: string, accountId: string, songId: string, userId: string, iso: string) => ({
	id,
	accountId,
	songId,
	userId,
	body: `Message ${id}`,
	mentions: null,
	editedAt: null,
	createdAt: at(iso),
	updatedAt: at(iso),
});
const sessionMessage = (
	id: string,
	accountId: string,
	sessionId: string,
	userId: string,
	iso: string,
) => ({
	id,
	accountId,
	sessionId,
	userId,
	body: `Message ${id}`,
	mentions: null,
	editedAt: null,
	createdAt: at(iso),
	updatedAt: at(iso),
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
		account: [
			{ id: A, plan: "free", isFounder: false, storageLimitBytes: null },
			{ id: B, plan: "free", isFounder: true, storageLimitBytes: null },
		],
		stem: [
			{ id: "st1", accountId: A, songId: "s2", status: "ready", sizeBytes: 1000 },
			{ id: "st2", accountId: A, songId: "s3", status: "uploading", sizeBytes: 500 },
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
		chatMessage: [
			// s1: three by V after U's mark (out of order), one before it, and U's own after it.
			message("c1", A, "s1", V, "2026-10-20T09:00:00Z"),
			message("c2", A, "s1", V, "2026-10-20T11:00:00Z"),
			message("c3", A, "s1", V, "2026-10-20T10:00:00Z"),
			message("c4", A, "s1", V, "2026-10-19T00:00:00Z"),
			message("c5", A, "s1", U, "2026-10-21T00:00:00Z"),
			// s2: never read, one by V.
			message("c6", A, "s2", V, "2026-10-22T00:00:00Z"),
			// s3: read after every message.
			message("c7", A, "s3", V, "2026-10-18T00:00:00Z"),
			// s4 is archived; sb is another account's.
			message("c8", A, "s4", V, "2026-10-23T00:00:00Z"),
			message("c9", B, "sb", V, "2026-10-23T00:00:00Z"),
		],
		chatRead: [
			{ userId: U, songId: "s1", readAt: at("2026-10-20T00:00:00Z") },
			{ userId: U, songId: "s3", readAt: at("2026-10-19T00:00:00Z") },
			{ userId: V, songId: "s2", readAt: at("2026-10-30T00:00:00Z") },
		],
		sessionChatMessage: [
			// "new": one by V after U's mark, one before it, U's own after it.
			sessionMessage("x1", A, "new", V, "2026-10-18T12:00:00Z"),
			sessionMessage("x2", A, "new", V, "2026-10-17T12:00:00Z"),
			sessionMessage("x3", A, "new", U, "2026-10-19T00:00:00Z"),
			// "old": never read, two by V, newer than "new"'s.
			sessionMessage("x4", A, "old", V, "2026-10-20T00:00:00Z"),
			sessionMessage("x5", A, "old", V, "2026-10-21T00:00:00Z"),
			// "same-day-earlier": read after its message.
			sessionMessage("x6", A, "same-day-earlier", V, "2026-10-17T05:00:00Z"),
			// Another account's.
			sessionMessage("x7", B, "b", V, "2026-10-25T00:00:00Z"),
		],
		sessionChatRead: [
			{ userId: U, sessionId: "new", readAt: at("2026-10-18T00:00:00Z") },
			{ userId: U, sessionId: "same-day-earlier", readAt: at("2026-10-18T00:00:00Z") },
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

describe("accountBand", () => {
	const W = "user-three__________";
	const far = new Date("2027-01-01");
	beforeEach(() =>
		reset({
			user: [
				{ id: U, name: "Uma", email: "u@x" },
				{ id: V, name: "Vic", email: "v@x" },
				{ id: W, name: "Wes", email: "w@x" },
			],
			accountMember: [
				{ id: "m1", accountId: A, userId: U, role: "owner" },
				{ id: "m2", accountId: A, userId: V, role: "member" },
				{ id: "m4", accountId: A, userId: W, role: "member" },
				{ id: "m3", accountId: B, userId: U, role: "owner" },
			],
			session: [
				{ id: "se1", token: "t1", userId: V, expiresAt: far, updatedAt: new Date("2026-10-26") },
				{ id: "se2", token: "t2", userId: U, expiresAt: far, updatedAt: new Date("2026-10-01") },
				{ id: "se3", token: "t3", userId: U, expiresAt: far, updatedAt: new Date("2026-10-25") },
				{ id: "se4", token: "t4", userId: W, expiresAt: far, updatedAt: new Date("2026-09-01") },
			],
		}),
	);
	test("the members with a session touched since the date, by name alphabetically, and how many members there are", async () => {
		expect(await accountBand(A, new Date("2026-10-13"))).toEqual({
			total: 3,
			active: ["Uma", "Vic"],
		});
		expect(await accountBand(B, new Date("2026-10-13"))).toEqual({ total: 1, active: ["Uma"] });
		expect(await accountBand(A, new Date("2026-10-27"))).toEqual({ total: 3, active: [] });
	});
});

describe("accountQuota", () => {
	test("bytes stored (uploads still in flight count, failed ones do not) against the plan's limits; a founder account has none", async () => {
		expect(await accountQuota(A)).toEqual({
			bytes: 1500,
			storageLimit: PLAN_LIMITS.free.storageBytes,
			memberLimit: PLAN_LIMITS.free.members,
		});
		expect(await accountQuota(B)).toEqual({ bytes: 0, storageLimit: null, memberLimit: null });
	});
});

describe("accountCounts", () => {
	test("active projects and songs, sessions, ready recordings and members of the account only", async () => {
		expect(await accountCounts(A)).toEqual({
			projects: 3,
			songs: 3,
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

describe("unreadSongChats", () => {
	test("songs with messages by others after the person's read mark, newest unread first, with the href and view facts", async () => {
		const rows = await unreadSongChats(A, "band", U);
		expect(rows.map((r) => r.songId)).toEqual(["s2", "s1"]);
		const [s2, s1] = rows;
		expect(s1).toMatchObject({
			title: "Song s1",
			unread: 3,
			latest: at("2026-10-20T11:00:00Z"),
			href: "/band/projects/p1/s1?open=chat",
			id: "s1",
			projectId: "p1",
			isPrivate: false,
			project: { name: "Project p1", isPrivate: false, isRestricted: false },
		});
		expect(s2).toMatchObject({ unread: 1, latest: at("2026-10-22T00:00:00Z") });
	});
	test("the person's own messages never count; a song read after every message, an archived song and another account's are left out", async () => {
		const ids = (await unreadSongChats(A, "band", U)).map((r) => r.songId);
		expect(ids).not.toContain("s3");
		expect(ids).not.toContain("s4");
		expect(ids).not.toContain("sb");
		// For V only U's message on s1 counts: V's own never do, and V read s2 after its message.
		expect(
			(await unreadSongChats(A, "band", V)).map((r) => [r.songId, r.unread, r.latest]),
		).toEqual([["s1", 1, at("2026-10-21T00:00:00Z")]]);
		expect(await unreadSongChats(B, "other", V)).toEqual([]);
		expect((await unreadSongChats(B, "other", U)).map((r) => r.href)).toEqual([
			"/other/projects/pb/sb?open=chat",
		]);
	});
	test("a song whose project is not active is left out", async () => {
		reset({
			project: [project("gone", A, 9, { status: "archived" })],
			song: [song("sg", A, "gone", 2)],
			chatMessage: [message("g1", A, "sg", V, "2026-10-20T00:00:00Z")],
		});
		expect(await unreadSongChats(A, "band", U)).toEqual([]);
	});
});

describe("unreadSessionChats", () => {
	test("sessions with messages by others after the person's read mark, newest unread first, with the href", async () => {
		const rows = await unreadSessionChats(A, "band", U);
		expect(rows).toEqual([
			{
				sessionId: "old",
				name: "",
				place: "The Room",
				kind: "practice",
				startsOn: "2026-10-10",
				href: "/band/sessions?session=old&open=chat",
				unread: 2,
				latest: at("2026-10-21T00:00:00Z"),
			},
			{
				sessionId: "new",
				name: "",
				place: "The Room",
				kind: "practice",
				startsOn: "2026-10-17",
				href: "/band/sessions?session=new&open=chat",
				unread: 1,
				latest: at("2026-10-18T12:00:00Z"),
			},
		]);
	});
	test("the person's own messages never count; another account's sessions are left out", async () => {
		expect((await unreadSessionChats(A, "band", V)).map((r) => r.sessionId)).toEqual(["new"]);
		expect((await unreadSessionChats(B, "other", U)).map((r) => r.href)).toEqual([
			"/other/sessions?session=b&open=chat",
		]);
		expect(await unreadSessionChats(B, "other", V)).toEqual([]);
	});
});

/** A file row (stem, demo, mix, notation) of account A on a song, with its upload and rendition state. */
const file = (
	id: string,
	songId: string,
	iso: string,
	over: Record<string, unknown> = {},
	accountId = A,
) => ({
	id,
	accountId,
	songId,
	label: `Label ${id}`,
	status: "ready",
	playbackStatus: "ready",
	uploadedBy: U,
	createdAt: at(iso),
	...over,
});
const users = [
	{ id: U, name: "Uma" },
	{ id: V, name: "Vic" },
];
const newSessionName = sessionDisplayName({
	name: "",
	place: "The Room",
	kind: "practice",
	startsOn: "2026-10-17",
});
const s1Facts = {
	id: "s1",
	isPrivate: false,
	projectId: "p1",
	project: { isPrivate: false, isRestricted: false },
};

describe("accountActivity", () => {
	const since = at("2026-10-20T00:00:00Z");
	beforeEach(() =>
		reset({
			user: users,
			recordingSession: [session("new", A), session("b", B)],
			project: [
				project("p1", A, 1, { createdAt: at("2026-10-21T00:00:00Z") }),
				project("p2", A, 1, { createdAt: at("2026-10-01T00:00:00Z") }),
				project("pr", A, 1, {
					isPrivate: true,
					isRestricted: true,
					createdAt: at("2026-10-01T00:00:00Z"),
				}),
				project("gone", A, 9, { status: "archived", createdAt: at("2026-10-22T00:00:00Z") }),
				project("pb", B, 20, { createdAt: at("2026-10-22T00:00:00Z") }),
			],
			song: [
				song("s1", A, "p1", 2),
				song("s5", A, "p1", 2, { createdAt: at("2026-10-23T00:00:00Z") }),
				song("sp", A, "pr", 2, { isPrivate: true }),
				song("s4", A, "p1", 2, { status: "archived", createdAt: at("2026-10-22T00:00:00Z") }),
				song("sg", A, "gone", 2),
				song("sb", B, "pb", 2, { createdAt: at("2026-10-22T00:00:00Z") }),
			],
			stem: [
				file("st1", "s1", "2026-10-22T10:00:00Z"),
				file("st2", "s1", "2026-10-10T00:00:00Z"), // before the window
				file("st3", "s1", "2026-10-22T10:30:00Z", { status: "uploading" }),
				file("stp", "sp", "2026-10-22T09:00:00Z", { uploadedBy: null }),
				file("st4", "s4", "2026-10-22T10:00:00Z"), // archived song
				file("stg", "sg", "2026-10-22T10:00:00Z"), // archived project
				file("stb", "sb", "2026-10-22T10:00:00Z", {}, B),
			],
			demo: [file("d1", "s1", "2026-10-22T11:00:00Z", { uploadedBy: V })],
			songMix: [file("mx1", "s1", "2026-10-22T12:00:00Z", { version: 3, label: "Rough mix" })],
			sessionRecording: [
				recording("r1", A, "new", { title: "Take one", createdAt: at("2026-10-22T13:00:00Z") }),
				recording("r2", A, "new", { status: "uploading", createdAt: at("2026-10-22T13:30:00Z") }),
				recording("rb", B, "b", { createdAt: at("2026-10-22T13:00:00Z") }),
			],
			songDocVersion: [
				{
					id: "dv1",
					songId: "s1",
					kind: "chart",
					userId: null,
					createdBy: V,
					createdAt: at("2026-10-22T14:00:00Z"),
				},
				// A private note's revision, and another account's doc.
				{
					id: "dv2",
					songId: "s1",
					kind: "mynotes",
					userId: U,
					createdBy: U,
					createdAt: at("2026-10-22T15:00:00Z"),
				},
				{
					id: "dvb",
					songId: "sb",
					kind: "lyrics",
					userId: null,
					createdBy: V,
					createdAt: at("2026-10-22T15:00:00Z"),
				},
			],
			chatMessage: [
				message("c1", A, "s1", V, "2026-10-22T16:00:00Z"),
				message("c0", A, "s1", V, "2026-10-19T00:00:00Z"), // before the window
				message("cb", B, "sb", V, "2026-10-22T16:00:00Z"),
			],
			sessionChatMessage: [sessionMessage("x1", A, "new", U, "2026-10-22T17:00:00Z")],
			comment: [
				{ id: "cm1", accountId: A, songId: "s1", userId: U, createdAt: at("2026-10-22T18:00:00Z") },
				{ id: "cm4", accountId: A, songId: "s4", userId: U, createdAt: at("2026-10-22T18:00:00Z") },
			],
			sessionComment: [
				{
					id: "sc1",
					accountId: A,
					recordingId: "r1",
					userId: V,
					createdAt: at("2026-10-22T19:00:00Z"),
				},
			],
		}),
	);

	test("every kind merged newest first with who, label, title, href and the song's view facts", async () => {
		const rows = await accountActivity(A, "band", since, 50);
		expect(rows.map((r) => r.id)).toEqual([
			"song:s5",
			"session-comment:sc1",
			"comment:cm1",
			"session-chat:x1",
			"chat:c1",
			"doc:dv1",
			"session-recording:r1",
			"mix:mx1",
			"demo:d1",
			"stem:st1",
			"stem:stp",
			"project:p1",
		]);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get("stem:st1")).toEqual({
			id: "stem:st1",
			kind: "stem",
			at: at("2026-10-22T10:00:00Z"),
			who: "Uma",
			label: "Label st1",
			title: "Song s1",
			href: "/band/projects/p1/s1",
			song: s1Facts,
		});
		expect(byId.get("mix:mx1")).toMatchObject({ label: "v3 Rough mix", who: "Uma" });
		expect(byId.get("demo:d1")).toMatchObject({ who: "Vic" });
		expect(byId.get("doc:dv1")).toMatchObject({ label: "chart", who: "Vic", song: s1Facts });
		expect(byId.get("chat:c1")).toMatchObject({ label: "", who: "Vic", title: "Song s1" });
		expect(byId.get("stem:stp")).toMatchObject({
			who: null,
			href: "/band/projects/pr/sp",
			song: {
				id: "sp",
				isPrivate: true,
				projectId: "pr",
				project: { isPrivate: true, isRestricted: true },
			},
		});
		for (const id of ["session-recording:r1", "session-chat:x1", "session-comment:sc1"])
			expect(byId.get(id)).toMatchObject({
				title: newSessionName,
				href: "/band/sessions/s/new",
				song: null,
			});
		expect(byId.get("session-recording:r1")).toMatchObject({ label: "Take one", who: null });
		expect(byId.get("session-comment:sc1")).toMatchObject({ who: "Vic", label: "" });
		expect(byId.get("song:s5")).toMatchObject({ label: "Song s5", who: null, title: "Song s5" });
		expect(byId.get("project:p1")).toEqual({
			id: "project:p1",
			kind: "project",
			at: at("2026-10-21T00:00:00Z"),
			who: null,
			label: "Project p1",
			title: "Project p1",
			href: "/band/projects/p1",
			song: null,
		});
	});

	test("the window, uploads not ready, private doc revisions, archived songs and projects and another account are left out", async () => {
		const ids = (await accountActivity(A, "band", since, 50)).map((r) => r.id);
		for (const id of [
			"stem:st2",
			"chat:c0",
			"project:p2",
			"stem:st3",
			"session-recording:r2",
			"doc:dv2",
			"doc:dvb",
			"stem:st4",
			"comment:cm4",
			"song:s4",
			"stem:stg",
			"project:gone",
			"stem:stb",
			"chat:cb",
		])
			expect(ids).not.toContain(id);
		expect(
			(await accountActivity(A, "band", at("2026-10-22T17:30:00Z"), 50)).map((r) => r.id),
		).toEqual(["song:s5", "session-comment:sc1", "comment:cm1"]);
		expect((await accountActivity(B, "other", since, 50)).map((r) => r.id)).toEqual([
			"chat:cb",
			"doc:dvb",
			"session-recording:rb",
			"stem:stb",
			"song:sb",
			"project:pb",
		]);
	});

	test("at most `limit` events after the merge", async () => {
		expect((await accountActivity(A, "band", since, 3)).map((r) => r.id)).toEqual([
			"song:s5",
			"session-comment:sc1",
			"comment:cm1",
		]);
		expect(await accountActivity("nobody______________", "x", since, 10)).toEqual([]);
	});
});

describe("accountPendingWork", () => {
	beforeEach(() =>
		reset({
			recordingSession: [session("new", A)],
			project: [project("p1", A, 1), project("pb", B, 1)],
			song: [
				song("s1", A, "p1", 2, {
					mixStartedAt: at("2026-10-20T08:00:00Z"),
					notesStartedAt: at("2026-10-20T09:00:00Z"),
				}),
				song("s2", A, "p1", 2, { mixStartedAt: null, notesStartedAt: null }),
				song("s4", A, "p1", 2, { status: "archived", mixStartedAt: at("2026-10-20T08:00:00Z") }),
				song("sb", B, "pb", 2, { mixStartedAt: at("2026-10-20T08:00:00Z") }),
			],
			stem: [
				file("pu1", "s1", "2026-10-20T01:00:00Z", { status: "uploading", playbackStatus: null }),
				file("pr1", "s1", "2026-10-20T02:00:00Z", { playbackStatus: null }),
				file("pr2", "s2", "2026-10-20T03:00:00Z", { playbackStatus: "pending" }),
				file("pf", "s1", "2026-10-20T04:00:00Z", { playbackStatus: "failed" }),
				file("pok", "s1", "2026-10-20T04:30:00Z"), // done
				file("pab", "s1", "2026-10-20T04:40:00Z", { status: "failed", playbackStatus: null }),
				file("p4", "s4", "2026-10-20T04:50:00Z", { status: "uploading" }), // archived song
				file("stb", "sb", "2026-10-20T00:00:00Z", { status: "uploading" }, B),
			],
			demo: [file("dp", "s1", "2026-10-20T05:00:00Z", { playbackStatus: "pending" })],
			songMix: [
				file("mp", "s2", "2026-10-20T06:00:00Z", {
					status: "uploading",
					playbackStatus: null,
					version: 2,
					label: "Final",
				}),
			],
			sessionRecording: [
				recording("rp", A, "new", {
					title: "Set one",
					playbackStatus: null,
					createdAt: at("2026-10-20T07:00:00Z"),
				}),
				recording("rok", A, "new", { playbackStatus: "ready" }),
			],
			songNotation: [
				file("n1", "s1", "2026-10-20T10:00:00Z", { title: "Lead sheet", pdfStatus: "pending" }),
				file("n2", "s1", "2026-10-20T00:30:00Z", {
					status: "uploading",
					title: "",
					pdfStatus: null,
				}),
				file("n3", "s1", "2026-10-20T10:30:00Z", { pdfStatus: "ready" }),
				file("n4", "s2", "2026-10-20T11:00:00Z", { title: "Old score", pdfStatus: "failed" }),
				file("n5", "s2", "2026-10-20T12:00:00Z", { title: "Before PDFs", pdfStatus: null }),
			],
		}),
	);

	test("each unfinished thing oldest first, in its state, with its label, title and href", async () => {
		const rows = await accountPendingWork(A, "band");
		expect(rows.map((r) => [r.id, r.state])).toEqual([
			["notation:n2", "uploading"],
			["stem:pu1", "uploading"],
			["stem:pr1", "rendering"],
			["stem:pr2", "rendering"],
			["stem:pf", "failed"],
			["demo:dp", "rendering"],
			["mix:mp", "uploading"],
			["session-recording:rp", "rendering"],
			["song-mix:s1", "rendering"],
			["notes:s1", "rendering"],
			["notation:n1", "rendering"],
			["notation:n4", "failed"],
			["notation:n5", "rendering"],
		]);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get("stem:pu1")).toEqual({
			id: "stem:pu1",
			kind: "stem",
			state: "uploading",
			label: "Label pu1",
			title: "Song s1",
			href: "/band/projects/p1/s1",
			since: at("2026-10-20T01:00:00Z"),
			song: s1Facts,
		});
		expect(byId.get("mix:mp")).toMatchObject({ label: "v2 Final", href: "/band/projects/p1/s2" });
		expect(byId.get("session-recording:rp")).toMatchObject({
			label: "Set one",
			title: newSessionName,
			href: "/band/sessions/s/new",
			song: null,
		});
		expect(byId.get("song-mix:s1")).toMatchObject({
			kind: "song-mix",
			label: "",
			since: at("2026-10-20T08:00:00Z"),
			song: s1Facts,
		});
		expect(byId.get("notes:s1")).toMatchObject({ label: "", since: at("2026-10-20T09:00:00Z") });
		expect(byId.get("notation:n1")).toMatchObject({ kind: "notation", label: "Lead sheet" });
	});

	test("finished work, an abandoned upload, archived songs and another account are left out", async () => {
		const ids = (await accountPendingWork(A, "band")).map((r) => r.id);
		for (const id of [
			"stem:pok",
			"stem:pab",
			"stem:p4",
			"song-mix:s4",
			"song-mix:s2",
			"session-recording:rok",
			"notation:n3",
			"stem:stb",
			"song-mix:sb",
		])
			expect(ids).not.toContain(id);
		expect((await accountPendingWork(B, "other")).map((r) => r.id)).toEqual([
			"stem:stb",
			"song-mix:sb",
		]);
	});
});
