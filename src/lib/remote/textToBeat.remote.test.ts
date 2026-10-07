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
import { DRUM_METER_IDS } from "$lib/constants/drumMachine";

/** Text-to-Beat is open to visitors while the gateway is configured, limited per user or address. */
const remote = await import("./textToBeat.remote");
const { textToBeat } = await import("$lib/server/textToBeat");

const input = { prompt: "a slow funk groove", meter: DRUM_METER_IDS[0], steps: 16 };

beforeEach(() => {
	resetRemoteMocks();
	(textToBeat as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
		bpm: 90,
	});
});

describe("textToBeat", () => {
	it("503 when the gateway is not configured", async () => {
		asSignedOut();
		aiDetect.aiAvailable.mockReturnValue(false);
		await expect(call(remote.textToBeat, input)).rejects.toMatchObject(httpError(503));
		expect(textToBeat).not.toHaveBeenCalled();
	});
	it("a visitor asks, counted against their address, with no user on the log", async () => {
		asSignedOut();
		await expect(call(remote.textToBeat, input)).resolves.toEqual({ bpm: 90 });
		expect(rateLimited).toHaveBeenCalledWith("text-to-beat:203.0.113.7", 20, 3_600_000);
		expect(textToBeat).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: "a slow funk groove" }),
			{ userId: null },
		);
	});
	it("a signed-in user is counted and logged as themselves", async () => {
		asUser();
		await call(remote.textToBeat, input);
		expect(rateLimited).toHaveBeenCalledWith(`text-to-beat:${USER}`, 20, 3_600_000);
		expect(textToBeat).toHaveBeenCalledWith(expect.anything(), { userId: USER });
	});
	it("429 once the limiter says so, 502 when the model fails", async () => {
		asUser();
		rateLimited.mockResolvedValue(true);
		await expect(call(remote.textToBeat, input)).rejects.toMatchObject(httpError(429));
		rateLimited.mockResolvedValue(false);
		(textToBeat as unknown as { mockRejectedValue: (e: unknown) => void }).mockRejectedValue(
			new Error("nonsense"),
		);
		await expect(call(remote.textToBeat, input)).rejects.toMatchObject(httpError(502));
	});
});
