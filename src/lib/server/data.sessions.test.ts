import { MAX_SESSIONS_PER_ACCOUNT } from "#lib/constants/sessionRecordings.js";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { blob, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	claimSessionPlayback,
	createRecordingSession,
	createSessionRecording,
	deleteRecordingSession,
	deleteSessionRecording,
	failSessionRecording,
	findUploadingSession,
	finishSessionPlayback,
	listRecordingSessions,
	markSessionReady,
	recordSessionUrl,
	reservedPathname,
	sessionMp3s,
	sessionsNearDay,
	updateRecordingSession,
	updateSessionRecording,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);
const recordings = () => fake.rows("sessionRecording");
const sessions = () => fake.rows("recordingSession");

const session = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "practice",
	name: "",
	startsOn: "2026-10-17",
	place: "The Room",
	notes: "",
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
	notes: "",
	status: "ready",
	url: `https://blob/${id}.m4a`,
	pathname: `accounts/${accountId}/sessions/${id}.m4a`,
	filename: `${id}.m4a`,
	contentType: "audio/mp4",
	sizeBytes: 1000,
	playbackStatus: null,
	playbackUrl: null,
	playbackPathname: null,
	playbackBytes: null,
	playbackStartedAt: null,
	uploadedBy: U,
	createdAt: at("2026-10-17T20:00:00Z"),
	updatedAt: at("2026-10-17T20:00:00Z"),
	...over,
});

/** A practice (p1, two recordings) and a show (sh1, one ready and one uploading) on the 17th in A; a practice on the 10th; one session in B. */
function seed() {
	reset({
		user: [{ id: U, name: "Kevin", email: "k@example.com" }],
		recordingSession: [
			session("p0", A, { startsOn: "2026-10-10", createdAt: at("2026-10-10T00:00:00Z") }),
			session("p1", A),
			session("sh1", A, {
				kind: "show",
				name: "Friday at the Elbow Room",
				place: "The Elbow Room",
				createdAt: at("2026-10-17T01:00:00Z"),
			}),
			session("pb", B),
		],
		sessionRecording: [
			recording("r0", A, "p0", { recordedOn: "2026-10-10" }),
			recording("r1", A, "p1", { createdAt: at("2026-10-17T20:10:00Z") }),
			recording("r2", A, "p1", { createdAt: at("2026-10-17T20:00:00Z") }),
			recording("r3", A, "sh1", {
				recordedOn: "2026-10-18",
				playbackStatus: "ready",
				playbackUrl: "https://blob/r3.mp3",
			}),
			recording("r4", A, "sh1", { status: "uploading" }),
			recording("rb", B, "pb"),
		],
	});
}
beforeEach(seed);

describe("sessionsNearDay", () => {
	test("the sessions of a day and the day before, newest first", async () => {
		expect((await sessionsNearDay(A, "2026-10-18")).map((s) => s.id)).toEqual(["sh1", "p1"]);
		expect((await sessionsNearDay(A, "2026-10-17")).map((s) => s.id)).toEqual(["sh1", "p1"]);
		expect((await sessionsNearDay(A, "2026-10-10")).map((s) => s.id)).toEqual(["p0"]);
		expect(await sessionsNearDay(B, "2026-10-17")).toHaveLength(1);
	});
});

describe("createSessionRecording", () => {
	const file = { filename: "Set Two.WAV", contentType: "audio/wav", sizeBytes: 123 };
	test("joins the named session when it is the account's, else nothing", async () => {
		const row = await createSessionRecording(A, U, {
			sessionId: "p0",
			kind: "show",
			recordedOn: "2026-10-18",
			place: "",
			...file,
		});
		expect(row).toMatchObject({ sessionId: "p0", title: "Set Two", status: "uploading" });
		if (row && row !== "full") {
			expect(row.pathname).toBe(`accounts/${A}/sessions/${row.id}.wav`);
			expect(await findUploadingSession(A, row.pathname)).toMatchObject({ id: row.id });
			expect(await findUploadingSession(B, row.pathname)).toBeNull();
		}
		expect(
			await createSessionRecording(A, U, {
				sessionId: "pb",
				kind: "show",
				recordedOn: "2026-10-18",
				place: "",
				...file,
			}),
		).toBeNull();
	});
	test("without a session, the day's session of the kind, else the day before's, else a new one of the day", async () => {
		const sameDay = await createSessionRecording(A, U, {
			sessionId: null,
			kind: "practice",
			recordedOn: "2026-10-17",
			place: "",
			...file,
		});
		expect(sameDay).toMatchObject({ sessionId: "p1" });
		const nextDay = await createSessionRecording(A, U, {
			sessionId: null,
			kind: "show",
			recordedOn: "2026-10-18",
			place: "",
			...file,
		});
		expect(nextDay).toMatchObject({ sessionId: "sh1", recordedOn: "2026-10-18" });
		const before = sessions().length;
		const fresh = await createSessionRecording(A, U, {
			sessionId: null,
			kind: "show",
			recordedOn: "2026-10-03",
			place: "The Garage",
			...file,
		});
		expect(sessions()).toHaveLength(before + 1);
		const made = sessions().find((s) => s.id === (fresh as { sessionId: string }).sessionId);
		expect(made).toMatchObject({
			kind: "show",
			name: "",
			startsOn: "2026-10-03",
			place: "The Garage",
			createdBy: U,
		});
	});
	test("defaults the day to today when the browser sent none, and is full at the cap", async () => {
		const row = await createSessionRecording(A, U, {
			sessionId: "p1",
			kind: "practice",
			recordedOn: null,
			place: "",
			...file,
		});
		expect((row as { recordedOn: string }).recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		reset({
			recordingSession: [session("p1", A)],
			sessionRecording: Array.from({ length: MAX_SESSIONS_PER_ACCOUNT }, (_, i) =>
				recording(`x${i}`, A, "p1"),
			),
		});
		await expect(
			createSessionRecording(A, U, {
				sessionId: "p1",
				kind: "practice",
				recordedOn: null,
				place: "",
				...file,
			}),
		).resolves.toBe("full");
	});
});

describe("ready, failed and the backstop", () => {
	test("markSessionReady sets the URL for this account's row only and names the session", async () => {
		expect(await markSessionReady(B, "r4", "https://blob/x")).toBeNull();
		expect(await markSessionReady(A, "r4", "https://blob/r4")).toEqual({
			id: "r4",
			sessionId: "sh1",
		});
		expect(recordings().find((r) => r.id === "r4")).toMatchObject({
			status: "ready",
			url: "https://blob/r4",
		});
	});
	test("recordSessionUrl reaches only a row still uploading", async () => {
		await recordSessionUrl(`accounts/${A}/sessions/r1.m4a`, "https://blob/other");
		expect(recordings().find((r) => r.id === "r1")?.url).toBe("https://blob/r1.m4a");
		await recordSessionUrl(`accounts/${A}/sessions/r4.m4a`, "https://blob/r4");
		expect(recordings().find((r) => r.id === "r4")?.status).toBe("ready");
	});
	test("failSessionRecording drops the row and the file; reservedPathname knows the kind", async () => {
		await failSessionRecording(A, "r4", "https://blob/r4");
		expect(recordings().some((r) => r.id === "r4")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/r4"]);
		expect(await reservedPathname(A, "session", "r1")).toBe(`accounts/${A}/sessions/r1.m4a`);
		expect(await reservedPathname(B, "session", "r1")).toBeNull();
	});
});

describe("listRecordingSessions", () => {
	test("the account's sessions newest first, each with its ready recordings in the order made, with the uploader", async () => {
		const list = await listRecordingSessions(A);
		expect(list.map((s) => s.id)).toEqual(["sh1", "p1", "p0"]);
		expect(list[0]!.recordings.map((r) => r.id)).toEqual(["r3"]);
		expect(list[1]!.recordings.map((r) => r.id)).toEqual(["r2", "r1"]);
		expect(list[1]!.recordings[0]!.uploader).toEqual({ id: U, name: "Kevin" });
	});
});

describe("sessions: create, update, delete", () => {
	test("a session is the account's, named or not", async () => {
		const row = await createRecordingSession(A, U, {
			kind: "show",
			name: "Battle of the Bands",
			startsOn: "2026-11-01",
			place: "",
		});
		expect(row).toMatchObject({
			accountId: A,
			name: "Battle of the Bands",
			notes: "",
			createdBy: U,
		});
		const words = {
			kind: "practice" as const,
			name: "",
			startsOn: "2026-11-02",
			place: "Garage",
			notes: "x",
		};
		expect(await updateRecordingSession(B, row.id, words)).toBeNull();
		expect(await updateRecordingSession(A, row.id, words)).toMatchObject(words);
	});
	test("deleting a session takes its recordings and their files", async () => {
		expect(await deleteRecordingSession(B, "sh1")).toBe(false);
		expect(await deleteRecordingSession(A, "sh1")).toBe(true);
		expect(sessions().some((s) => s.id === "sh1")).toBe(false);
		expect(recordings().some((r) => r.sessionId === "sh1")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/r3.m4a",
			"https://blob/r3.mp3",
			"https://blob/r4.m4a",
			"",
		]);
	});
});

describe("recordings: update and delete", () => {
	const words = { title: "Set one", notes: "", recordedOn: "2026-10-18" };
	test("moves between sessions of its day or the day before, never further", async () => {
		expect(await updateSessionRecording(A, "r3", { ...words, sessionId: "p1" })).toMatchObject({
			sessionId: "p1",
			title: "Set one",
		});
		expect(await updateSessionRecording(A, "r3", { ...words, sessionId: "p0" })).toBe("day");
		expect(
			await updateSessionRecording(A, "r3", {
				...words,
				recordedOn: "2026-10-19",
				sessionId: "p1",
			}),
		).toBe("day");
		expect(await updateSessionRecording(A, "r3", { ...words, sessionId: "pb" })).toBeNull();
		expect(await updateSessionRecording(B, "r3", { ...words, sessionId: "pb" })).toBeNull();
	});
	test("a delete removes the row, the file and the MP3", async () => {
		expect(await deleteSessionRecording(B, "r3")).toBe(false);
		expect(await deleteSessionRecording(A, "r3")).toBe(true);
		expect(recordings().some((r) => r.id === "r3")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/r3.m4a", "https://blob/r3.mp3"]);
	});
});

describe("the MP3s", () => {
	test("sessionMp3s lists the ready MP3s of the account's session, in order", async () => {
		expect(await sessionMp3s(B, "sh1")).toBeNull();
		const found = await sessionMp3s(A, "sh1");
		expect(found?.session.id).toBe("sh1");
		expect(found?.recordings.map((r) => r.id)).toEqual(["r3"]);
		expect((await sessionMp3s(A, "p1"))?.recordings).toEqual([]);
	});
	test("a claim takes a ready recording without an MP3, once, and the finish records it", async () => {
		expect(await claimSessionPlayback("r4")).toBeNull();
		expect(await claimSessionPlayback("r3")).toBeNull();
		const claim = await claimSessionPlayback("r1");
		expect(claim).toMatchObject({ id: "r1", url: "https://blob/r1.m4a" });
		expect(await claimSessionPlayback("r1")).toBeNull();
		await finishSessionPlayback("r1", { url: "https://blob/r1.mp3", pathname: "p", bytes: 9 });
		expect(recordings().find((r) => r.id === "r1")).toMatchObject({
			playbackStatus: "ready",
			playbackUrl: "https://blob/r1.mp3",
			playbackBytes: 9,
		});
	});
});
