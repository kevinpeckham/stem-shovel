import { MAX_SESSIONS_PER_ACCOUNT } from "#lib/constants/sessionRecordings.js";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { blob, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	createSessionRecording,
	deleteSessionRecording,
	failSessionRecording,
	findUploadingSession,
	listSessionRecordings,
	markSessionReady,
	recordSessionUrl,
	reservedPathname,
	updateSessionRecording,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);
const rows = () => fake.rows("sessionRecording");

/** Three ready sessions and one still uploading in A; one in B. */
function seed() {
	reset({
		user: [{ id: U, name: "Kevin", email: "k@example.com" }],
		sessionRecording: [
			session("s1", A, { recordedOn: "2026-10-10", createdAt: at("2026-10-10T20:00:00Z") }),
			session("s2", A, { recordedOn: "2026-10-17", createdAt: at("2026-10-17T20:00:00Z") }),
			session("s3", A, {
				recordedOn: "2026-10-17",
				createdAt: at("2026-10-17T21:00:00Z"),
				kind: "show",
			}),
			session("s4", A, { recordedOn: "2026-10-18", status: "uploading" }),
			session("s5", B, { recordedOn: "2026-10-18" }),
		],
	});
}
function session(id: string, accountId: string, over: Record<string, unknown> = {}) {
	return {
		id,
		accountId,
		kind: "practice",
		title: id,
		recordedOn: "2026-10-01",
		place: "",
		notes: "",
		status: "ready",
		url: `https://blob/${id}.m4a`,
		pathname: `accounts/${accountId}/sessions/${id}.m4a`,
		filename: `${id}.m4a`,
		contentType: "audio/mp4",
		sizeBytes: 1000,
		uploadedBy: U,
		createdAt: at("2026-10-01T00:00:00Z"),
		updatedAt: at("2026-10-01T00:00:00Z"),
		...over,
	};
}

beforeEach(seed);

describe("createSessionRecording", () => {
	test("reserves a row under the account with the title from the filename and the day given", async () => {
		const row = await createSessionRecording(A, U, {
			kind: "show",
			recordedOn: "2026-10-18",
			place: "The Elbow Room",
			filename: "Set Two.WAV",
			contentType: "audio/wav",
			sizeBytes: 123,
		});
		expect(row).not.toBe("full");
		if (row === "full") return;
		expect(row.title).toBe("Set Two");
		expect(row.pathname).toBe(`accounts/${A}/sessions/${row.id}.wav`);
		expect(row.status).toBe("uploading");
		expect(row.kind).toBe("show");
		expect(row.recordedOn).toBe("2026-10-18");
		expect(row.place).toBe("The Elbow Room");
		expect(await findUploadingSession(A, row.pathname)).toMatchObject({
			id: row.id,
			contentType: "audio/wav",
			sizeBytes: 123,
		});
		expect(await findUploadingSession(B, row.pathname)).toBeNull();
	});
	test("defaults the day to today when the browser sent none", async () => {
		const row = await createSessionRecording(A, U, {
			kind: "practice",
			recordedOn: null,
			place: "",
			filename: "a.mp3",
			contentType: "audio/mpeg",
			sizeBytes: 1,
		});
		expect(row).not.toBe("full");
		if (row !== "full") expect(row.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	test("is full at the account's cap", async () => {
		reset({
			sessionRecording: Array.from({ length: MAX_SESSIONS_PER_ACCOUNT }, (_, i) =>
				session(`x${i}`, A),
			),
		});
		await expect(
			createSessionRecording(A, U, {
				kind: "practice",
				recordedOn: null,
				place: "",
				filename: "a.mp3",
				contentType: "audio/mpeg",
				sizeBytes: 1,
			}),
		).resolves.toBe("full");
	});
});

describe("ready, failed and the backstop", () => {
	test("markSessionReady sets the URL for this account's row only", async () => {
		expect(await markSessionReady(B, "s4", "https://blob/x")).toBeNull();
		expect(await markSessionReady(A, "s4", "https://blob/s4")).toEqual({ id: "s4" });
		expect(rows().find((r) => r.id === "s4")).toMatchObject({
			status: "ready",
			url: "https://blob/s4",
		});
	});
	test("recordSessionUrl reaches only a row still uploading", async () => {
		await recordSessionUrl(`accounts/${A}/sessions/s1.m4a`, "https://blob/other");
		expect(rows().find((r) => r.id === "s1")?.url).toBe("https://blob/s1.m4a");
		await recordSessionUrl(`accounts/${A}/sessions/s4.m4a`, "https://blob/s4");
		expect(rows().find((r) => r.id === "s4")).toMatchObject({
			status: "ready",
			url: "https://blob/s4",
		});
	});
	test("failSessionRecording drops the row and the file", async () => {
		await failSessionRecording(A, "s4", "https://blob/s4");
		expect(rows().some((r) => r.id === "s4")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/s4"]);
	});
	test("reservedPathname knows the kind", async () => {
		expect(await reservedPathname(A, "session", "s4")).toBe(`accounts/${A}/sessions/s4.m4a`);
		expect(await reservedPathname(B, "session", "s4")).toBeNull();
	});
});

describe("listSessionRecordings", () => {
	test("the account's ready sessions, newest day first then newest upload, with the uploader", async () => {
		const list = await listSessionRecordings(A);
		expect(list.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
		expect(list[0]!.uploader).toEqual({ id: U, name: "Kevin" });
	});
});

describe("updateSessionRecording / deleteSessionRecording", () => {
	test("the words change for this account's row only", async () => {
		const words = {
			kind: "show" as const,
			title: "Friday",
			recordedOn: "2026-10-16",
			place: "Elbow Room",
			notes: "Set two.",
		};
		expect(await updateSessionRecording(B, "s1", words)).toBeNull();
		const row = await updateSessionRecording(A, "s1", words);
		expect(row).toMatchObject(words);
		expect(rows().find((r) => r.id === "s1")).toMatchObject(words);
	});
	test("a delete removes the row and the file", async () => {
		expect(await deleteSessionRecording(B, "s1")).toBe(false);
		expect(await deleteSessionRecording(A, "s1")).toBe(true);
		expect(rows().some((r) => r.id === "s1")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/s1.m4a"]);
	});
});
