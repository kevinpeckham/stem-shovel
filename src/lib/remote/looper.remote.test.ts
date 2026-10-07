import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asMemberOf,
	asSignedOut,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the looper's query: a loop loads back only for the person who recorded its take. */
const looper = await import("./looper.remote");

const TAKE = fakeId("take-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("recording", { accountId: ACCOUNT });
});

describe("loopSources", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(looper.loopSources, { id: TAKE })).rejects.toMatchObject(httpError(401));
	});
	it("404 for an owner of the account who did not record it", async () => {
		asMemberOf(ACCOUNT, "owner");
		data.userOwnsRecording.mockResolvedValue(false);
		await expect(call(looper.loopSources, { id: TAKE })).rejects.toMatchObject(httpError(404));
		expect(data.loopSources).not.toHaveBeenCalled();
	});
	it("404 for a take that does not exist", async () => {
		asEditorOf(ACCOUNT);
		givenRow("recording", null);
		await expect(call(looper.loopSources, { id: TAKE })).rejects.toMatchObject(httpError(404));
		expect(data.userOwnsRecording).not.toHaveBeenCalled();
	});
	it("the recorder loads their loop, scoped by the take's account", async () => {
		asEditorOf(ACCOUNT, "member");
		data.userOwnsRecording.mockResolvedValue(true);
		data.loopSources.mockResolvedValue({ sources: [], settings: null });
		await expect(call(looper.loopSources, { id: TAKE })).resolves.toEqual({
			sources: [],
			settings: null,
		});
		expect(data.userOwnsRecording).toHaveBeenCalledWith(ACCOUNT, USER, TAKE);
		expect(data.loopSources).toHaveBeenCalledWith(ACCOUNT, TAKE);
	});
	it("the recorder's own membership does not matter: creatorship is the gate", async () => {
		asMemberOf(ACCOUNT, "viewer", { userId: OTHER_USER });
		data.userOwnsRecording.mockResolvedValue(true);
		data.loopSources.mockResolvedValue({ sources: [] });
		await expect(call(looper.loopSources, { id: TAKE })).resolves.toEqual({ sources: [] });
		expect(data.userOwnsRecording).toHaveBeenCalledWith(ACCOUNT, OTHER_USER, TAKE);
	});
});
