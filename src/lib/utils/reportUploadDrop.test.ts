import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock("@sentry/sveltekit", () => ({ captureMessage }));
const { reportUploadDrop } = await import("./reportUploadDrop");

beforeEach(() => captureMessage.mockReset());

describe("reportUploadDrop", () => {
	test("a retried drop is a warning under the one issue, tagged with the kind and the attempt", async () => {
		await reportUploadDrop(
			new TypeError("Failed to fetch"),
			"accounts/a/songs/s/demos/d.mp3",
			0,
			false,
		);
		expect(captureMessage).toHaveBeenCalledWith("An upload's transfer was dropped by the network", {
			level: "warning",
			fingerprint: ["upload-transfer-dropped"],
			tags: { "upload.kind": "demos", "upload.attempt": "1", "upload.outcome": "retried" },
			extra: { error: "Failed to fetch" },
		});
	});

	test("the last attempt's drop is an error; a pathname with no kind folder is a stem", async () => {
		await reportUploadDrop(new TypeError("Load failed"), "accounts/a/songs/s/stem1.wav", 2, true);
		expect(captureMessage.mock.calls[0]![1]).toMatchObject({
			level: "error",
			tags: { "upload.kind": "stems", "upload.attempt": "3", "upload.outcome": "failed" },
		});
	});

	test("the pathname, which carries ids, is never sent", async () => {
		await reportUploadDrop(
			new TypeError("Failed to fetch"),
			"accounts/SECRET/songs/s/mixes/m.wav",
			0,
			false,
		);
		expect(JSON.stringify(captureMessage.mock.calls)).not.toContain("SECRET");
	});

	test("an answer from the server is not a drop", async () => {
		await reportUploadDrop(
			new Error("Vercel Blob: content type not allowed"),
			"p/demos/d.mp3",
			0,
			true,
		);
		expect(captureMessage).not.toHaveBeenCalled();
	});
});
