import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the session recording remote functions: an editor of the recording's account (memberOf → accountOfSession). */
const sessions = await import("./sessions.remote");

const SESSION = fakeId("sess-one");
const WORDS = {
	kind: "show" as const,
	title: "Friday at the Elbow Room",
	recordedOn: "2026-10-17",
	place: "The Elbow Room",
	notes: "Second set only.",
};

beforeEach(() => {
	resetRemoteMocks();
	givenRow("sessionRecording", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "updateSession",
		fn: sessions.updateSession,
		input: { id: SESSION, ...WORDS },
		arrange: () => data.updateSessionRecording.mockResolvedValue({ id: SESSION, ...WORDS }),
		dataFn: "updateSessionRecording",
		args: [ACCOUNT, SESSION, WORDS],
		outcome: WORDS,
	},
	{
		name: "deleteSession",
		fn: sessions.deleteSession,
		input: { id: SESSION },
		arrange: () => data.deleteSessionRecording.mockResolvedValue(true),
		dataFn: "deleteSessionRecording",
		args: [ACCOUNT, SESSION],
		outcome: { deleted: true },
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
		it("404 for a recording that does not exist", async () => {
			asEditorOf(ACCOUNT);
			givenRow("sessionRecording", null);
			await expect(run()).rejects.toMatchObject(httpError(404));
		});
		it("an editor reaches the data layer scoped by the recording's account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

it("updateSession refuses a date that is not a day", async () => {
	asEditorOf(ACCOUNT);
	await expect(
		call(sessions.updateSession, { id: SESSION, ...WORDS, recordedOn: "yesterday" }),
	).rejects.toBeTruthy();
	expect(data.updateSessionRecording).not.toHaveBeenCalled();
});
