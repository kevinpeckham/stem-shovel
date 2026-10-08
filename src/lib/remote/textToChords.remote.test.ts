import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	USER,
	asSignedOut,
	asUser,
	call,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { aiDetect, rateLimited, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Text-to-Progression is open to visitors while the gateway is configured, limited per user or address. */
const remote = await import("./textToChords.remote");
const { textToChords } = await import("#lib/server/textToChords.js");

const input = { prompt: "a wistful ballad", beatsPerBar: 4, key: 0, style: "" };

beforeEach(() => {
	resetRemoteMocks();
	(textToChords as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
		chords: [],
	});
});

describe("textToChords", () => {
	it("503 when the gateway is not configured", async () => {
		asSignedOut();
		aiDetect.aiAvailable.mockReturnValue(false);
		await expect(call(remote.textToChords, input)).rejects.toMatchObject(httpError(503));
		expect(textToChords).not.toHaveBeenCalled();
	});
	it("a visitor asks, counted against their address, with no user on the log", async () => {
		asSignedOut();
		await expect(call(remote.textToChords, input)).resolves.toEqual({ chords: [] });
		expect(rateLimited).toHaveBeenCalledWith("text-to-chords:203.0.113.7", 20, 3_600_000);
		expect(textToChords).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: "a wistful ballad" }),
			{ userId: null },
		);
	});
	it("a signed-in user is counted and logged as themselves", async () => {
		asUser();
		await call(remote.textToChords, input);
		expect(rateLimited).toHaveBeenCalledWith(`text-to-chords:${USER}`, 20, 3_600_000);
		expect(textToChords).toHaveBeenCalledWith(expect.anything(), { userId: USER });
	});
	it("429 once the limiter says so, 502 when the model fails", async () => {
		asUser();
		rateLimited.mockResolvedValue(true);
		await expect(call(remote.textToChords, input)).rejects.toMatchObject(httpError(429));
		rateLimited.mockResolvedValue(false);
		(textToChords as unknown as { mockRejectedValue: (e: unknown) => void }).mockRejectedValue(
			new Error("nonsense"),
		);
		await expect(call(remote.textToChords, input)).rejects.toMatchObject(httpError(502));
	});
});
