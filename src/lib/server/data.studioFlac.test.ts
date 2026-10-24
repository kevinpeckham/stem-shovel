import { beforeEach, describe, expect, test } from "vite-plus/test";
import { fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	replaceStudioSourceFile,
	studioSourceForTranscode,
	studioSourceOwner,
	studioSourcesWantingFlac,
} = await import("./data");

/**
 * The rows behind a Studio source's FLAC rendition (src/lib/server/transcode.ts
 * `flacStudioSources`): what the jobs function reads, how the row follows the
 * new file inside its own account, and which of a song's sources the page's
 * load hands over.
 */
const source = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	ideaId: "i1",
	kind: "take",
	takeNumber: 1,
	trackLabel: "Guitar",
	status: "ready",
	url: `https://blob/accounts/a1/studio/i1/${id}.wav`,
	pathname: `accounts/a1/studio/i1/${id}.wav`,
	filename: `${id}.wav`,
	contentType: "audio/wav",
	sizeBytes: 1000,
	codec: "pcm",
	sampleRate: 48000,
	channels: 1,
	durationSeconds: 2,
	...over,
});

describe("studioSourceForTranscode and studioSourceOwner", () => {
	beforeEach(() => reset({ studioSource: [source("s1")] }));

	test("the jobs function reads the file's place, type, codec, status and size", async () => {
		await expect(studioSourceForTranscode("s1")).resolves.toEqual({
			id: "s1",
			accountId: "a1",
			url: "https://blob/accounts/a1/studio/i1/s1.wav",
			pathname: "accounts/a1/studio/i1/s1.wav",
			filename: "s1.wav",
			contentType: "audio/wav",
			codec: "pcm",
			status: "ready",
			sizeBytes: 1000,
		});
		await expect(studioSourceForTranscode("gone")).resolves.toBeNull();
	});
	test("the owner carries the type and codec the ready route decides on", async () => {
		await expect(studioSourceOwner("s1")).resolves.toEqual({
			accountId: "a1",
			ideaId: "i1",
			pathname: "accounts/a1/studio/i1/s1.wav",
			contentType: "audio/wav",
			codec: "pcm",
		});
	});
});

describe("replaceStudioSourceFile", () => {
	const flac = {
		url: "https://blob/accounts/a1/studio/i1/s1.flac",
		pathname: "accounts/a1/studio/i1/s1.flac",
		filename: "s1.flac",
		contentType: "audio/flac",
		sizeBytes: 480,
		codec: "flac" as const,
	};
	beforeEach(() => reset({ studioSource: [source("s1")] }));

	test("the row points at the FLAC, its peaks, length and id untouched", async () => {
		await expect(replaceStudioSourceFile("a1", "s1", flac)).resolves.toEqual({ id: "s1" });
		expect(fake.rows("studioSource")[0]).toMatchObject({ ...flac, id: "s1", durationSeconds: 2 });
	});
	test("another account's source is not touched", async () => {
		await expect(replaceStudioSourceFile("a2", "s1", flac)).resolves.toBeNull();
		expect(fake.rows("studioSource")[0]).toMatchObject({ codec: "pcm", sizeBytes: 1000 });
	});
});

describe("studioSourcesWantingFlac", () => {
	test("the song's ready WAV sources, by codec, type or extension, in its own account", async () => {
		reset({
			studioSource: [
				source("take"),
				source("imported", { codec: null, contentType: "audio/x-wav" }),
				source("flac", {
					codec: "flac",
					contentType: "audio/flac",
					pathname: "accounts/a1/studio/i1/flac.flac",
				}),
				source("mp3", {
					codec: null,
					contentType: "audio/mpeg",
					pathname: "accounts/a1/studio/i1/mp3.mp3",
				}),
				source("uploading", { status: "uploading" }),
				source("otherSong", { ideaId: "i2" }),
				source("otherAccount", { accountId: "a2" }),
			],
		});
		await expect(studioSourcesWantingFlac("a1", "i1")).resolves.toEqual(["take", "imported"]);
	});
	test("at most 50 a visit", async () => {
		reset({ studioSource: Array.from({ length: 60 }, (_, i) => source(`s${i}`)) });
		await expect(studioSourcesWantingFlac("a1", "i1")).resolves.toHaveLength(50);
	});
});
