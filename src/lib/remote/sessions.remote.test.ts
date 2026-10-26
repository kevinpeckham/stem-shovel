import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";

/** Authorization of the sessions remote functions: an editor of the session's (or recording's) account. */
const sessions = await import("./sessions.remote");

const SESSION = fakeId("sess-one");
const RECORDING = fakeId("rec-one");
const SESSION_WORDS = {
	kind: "show" as const,
	name: "Friday at the Elbow Room",
	startsOn: "2026-10-17",
	place: "The Elbow Room",
	notes: "Second set only.",
};
const EQ = {
	...structuredClone(DEFAULT_PLAYBACK_EQ),
	highPass: true,
	mid: { gain: 3, freq: 1000 },
};
const RECORDING_WORDS = {
	sessionId: SESSION,
	title: "Set two",
	recordedOn: "2026-10-18",
	notes: "",
	source: "",
	device: "phone" as const,
	songId: "",
};

beforeEach(() => {
	resetRemoteMocks();
	givenRow("recordingSession", { accountId: ACCOUNT });
	givenRow("sessionRecording", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "createSession",
		fn: sessions.createSession,
		input: { accountId: ACCOUNT, ...SESSION_WORDS },
		arrange: () => data.createRecordingSession.mockResolvedValue({ id: SESSION }),
		dataFn: "createRecordingSession",
		args: [ACCOUNT, USER, { accountId: ACCOUNT, ...SESSION_WORDS }],
		outcome: { id: SESSION },
		missing: null,
	},
	{
		name: "updateSession",
		fn: sessions.updateSession,
		input: { id: SESSION, ...SESSION_WORDS },
		arrange: () => data.updateRecordingSession.mockResolvedValue({ id: SESSION, ...SESSION_WORDS }),
		dataFn: "updateRecordingSession",
		args: [ACCOUNT, SESSION, SESSION_WORDS],
		outcome: SESSION_WORDS,
		missing: "recordingSession",
	},
	{
		name: "saveSessionEq",
		fn: sessions.saveSessionEq,
		input: { id: SESSION, eq: EQ },
		arrange: () => data.updateRecordingSessionEq.mockResolvedValue({ eq: EQ }),
		dataFn: "updateRecordingSessionEq",
		args: [ACCOUNT, SESSION, EQ],
		outcome: { eq: EQ },
		missing: "recordingSession",
	},
	{
		name: "deleteSession",
		fn: sessions.deleteSession,
		input: { id: SESSION },
		arrange: () => data.deleteRecordingSession.mockResolvedValue(true),
		dataFn: "deleteRecordingSession",
		args: [ACCOUNT, SESSION],
		outcome: { deleted: true },
		missing: "recordingSession",
	},
	{
		name: "updateRecording",
		fn: sessions.updateRecording,
		input: { id: RECORDING, ...RECORDING_WORDS },
		arrange: () =>
			data.updateSessionRecording.mockResolvedValue({ id: RECORDING, ...RECORDING_WORDS }),
		dataFn: "updateSessionRecording",
		args: [ACCOUNT, RECORDING, RECORDING_WORDS],
		outcome: RECORDING_WORDS,
		missing: "sessionRecording",
	},
	{
		name: "deleteRecording",
		fn: sessions.deleteRecording,
		input: { id: RECORDING },
		arrange: () => data.deleteSessionRecording.mockResolvedValue(true),
		dataFn: "deleteSessionRecording",
		args: [ACCOUNT, RECORDING],
		outcome: { deleted: true },
		missing: "sessionRecording",
	},
];

for (const c of cases) {
	const run = () => {
		c.arrange();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("401 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(401));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a member of another account", async () => {
			asOutsider();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a viewer of the account", async () => {
			asViewerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		if (c.missing)
			it("404 for a row that does not exist", async () => {
				asEditorOf(ACCOUNT);
				givenRow(c.missing, null);
				await expect(run()).rejects.toMatchObject(httpError(404));
			});
		it("an editor reaches the data layer scoped by the account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

it("updateRecording says so when the day does not fit the session", async () => {
	asEditorOf(ACCOUNT);
	data.updateSessionRecording.mockResolvedValue("day");
	await expect(
		call(sessions.updateRecording, { id: RECORDING, ...RECORDING_WORDS }),
	).rejects.toMatchObject(httpError(409));
});

it("refuses a date that is not a day", async () => {
	asEditorOf(ACCOUNT);
	await expect(
		call(sessions.updateSession, { id: SESSION, ...SESSION_WORDS, startsOn: "yesterday" }),
	).rejects.toBeTruthy();
	expect(data.updateRecordingSession).not.toHaveBeenCalled();
});

describe("saveSessionEq", () => {
	it("stores the settings normalized to the half-dB grid and returns what was stored", async () => {
		asEditorOf(ACCOUNT);
		data.updateRecordingSessionEq.mockImplementation(async (_a, _s, eq) => ({ eq }));
		const sent = { ...EQ, low: { gain: 2.3, freq: 100 } };
		const res = await call(sessions.saveSessionEq, { id: SESSION, eq: sent });
		expect(data.updateRecordingSessionEq).toHaveBeenCalledWith(ACCOUNT, SESSION, {
			...sent,
			low: { gain: 2.5, freq: 100 },
		});
		expect(res).toEqual({ eq: { ...sent, low: { gain: 2.5, freq: 100 } } });
	});
	it("null clears it", async () => {
		asEditorOf(ACCOUNT);
		data.updateRecordingSessionEq.mockResolvedValue({ eq: null });
		await expect(call(sessions.saveSessionEq, { id: SESSION, eq: null })).resolves.toEqual({
			eq: null,
		});
		expect(data.updateRecordingSessionEq).toHaveBeenCalledWith(ACCOUNT, SESSION, null);
	});
	it("404 when the update matches no row", async () => {
		asEditorOf(ACCOUNT);
		data.updateRecordingSessionEq.mockResolvedValue(null);
		await expect(call(sessions.saveSessionEq, { id: SESSION, eq: EQ })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("refuses settings that are not an EQ", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(sessions.saveSessionEq, { id: SESSION, eq: { highPass: "yes" } as never }),
		).rejects.toBeTruthy();
		expect(data.updateRecordingSessionEq).not.toHaveBeenCalled();
	});
});
