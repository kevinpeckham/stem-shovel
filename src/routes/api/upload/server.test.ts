import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	asEditorOf,
	asSystemAdmin,
	asViewerOf,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	resetRemoteMocks,
} from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { DRUM_SAMPLE_MAX_BYTES } from "$lib/constants/drumKits";
import { FILE_CONTENT_TYPES, FILE_MAX_BYTES } from "$lib/constants/fileFormats";
import { MIDI_MAX_BYTES } from "$lib/constants/midiFormats";
import { NOTATION_CONTENT_TYPES, NOTATION_MAX_BYTES } from "$lib/constants/notationFormats";
import { STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { MAX_TAKE_BYTES } from "$lib/constants/takeLimits";

/**
 * Step 2 of an upload: the token route. `handleUpload` is replaced by a spy
 * that keeps the options the route built, so each test drives
 * `onBeforeGenerateToken` (who may upload what, with which ceiling) and
 * `onUploadCompleted` (which row the backstop records the URL on) directly.
 */
type UploadOptions = {
	onBeforeGenerateToken: (pathname: string) => Promise<{
		allowedContentTypes: string[];
		maximumSizeInBytes: number;
		tokenPayload: string;
	}>;
	onUploadCompleted: (arg: { blob: { pathname: string; url: string } }) => Promise<void>;
};
const h = vi.hoisted(() => ({ handleUpload: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: h.handleUpload }));

const { POST } = await import("./+server");
const realBlob = await vi.importActual<typeof import("$lib/server/blob")>("$lib/server/blob");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const DEMO = fakeId("demo-one");
const RECORDING = fakeId("rec-one");
const RSTEM = fakeId("rstem-one");
const IDEA = fakeId("idea-one");
const SOURCE = fakeId("src-one");
const KIT = fakeId("kit-one");
const SAMPLE = fakeId("sample-one");
const FILE = fakeId("file-one");
const NOTATION = fakeId("notation-one");

const paths = {
	stem: `accounts/${ACCOUNT}/songs/${SONG}/${STEM}.wav`,
	demo: `accounts/${ACCOUNT}/songs/${SONG}/demos/${DEMO}.m4a`,
	midi: `accounts/${ACCOUNT}/songs/${SONG}/midi/${STEM}-abc.mid`,
	recording: `accounts/${ACCOUNT}/recordings/${RECORDING}.webm`,
	recordingStem: `accounts/${ACCOUNT}/recordings/${RECORDING}/${RSTEM}.webm`,
	studio: `accounts/${ACCOUNT}/studio/${IDEA}/${SOURCE}.wav`,
	kit: `accounts/${ACCOUNT}/kits/${KIT}/${SAMPLE}.wav`,
	siteKit: `site/kits/${KIT}/${SAMPLE}.wav`,
	file: `accounts/${ACCOUNT}/songs/${SONG}/files/${FILE}.pdf`,
	notation: `accounts/${ACCOUNT}/songs/${SONG}/notation/${NOTATION}.mxl`,
};
const TOKEN_RESULT = { type: "blob.generate-client-token", clientToken: "tok" };

/** Posts the token request for a pathname and returns the options the route handed `handleUpload`. */
async function optionsFor(pathname: string, locals: FakeRequestEvent = asEditorOf(ACCOUNT)) {
	const body = {
		type: "blob.generate-client-token",
		payload: { pathname, callbackUrl: "", clientPayload: null, multipart: false },
	};
	const res = await callRoute(POST, locals, jsonPost("/api/upload", body));
	expect(res.status).toBe(200);
	return h.handleUpload.mock.calls.at(-1)?.[0] as UploadOptions;
}
const tokenFor = async (pathname: string, locals?: FakeRequestEvent) =>
	(await optionsFor(pathname, locals)).onBeforeGenerateToken(pathname);

beforeEach(() => {
	resetRemoteMocks();
	h.handleUpload.mockResolvedValue(TOKEN_RESULT);
	// The pathname predicates are the real ones; the store choice and the token are stubbed.
	for (const name of [
		"isDrumSamplePathname",
		"isSiteKitPathname",
		"isStudioPathname",
		"isFilePathname",
		"isNotationPathname",
	] as const) {
		blob[name].mockImplementation(realBlob[name]);
	}
	blob.recordingAccess.mockReturnValue("private");
	blob.blobAuth.mockReturnValue({ token: "t" });
});

describe("POST /api/upload", () => {
	it("answers what handleUpload answers", async () => {
		const res = await callRoute(
			POST,
			asEditorOf(ACCOUNT),
			jsonPost("/api/upload", {
				type: "blob.generate-client-token",
				payload: { pathname: paths.stem },
			}),
		);
		expect(await res.json()).toEqual(TOKEN_RESULT);
		expect(h.handleUpload).toHaveBeenCalledWith(expect.objectContaining({ token: "t" }));
	});
	it("a refusal inside handleUpload is a 400 with the message, never a 500", async () => {
		h.handleUpload.mockRejectedValue(new Error('No reservation for "x"'));
		const res = await callRoute(
			POST,
			asEditorOf(ACCOUNT),
			jsonPost("/api/upload", {
				type: "blob.generate-client-token",
				payload: { pathname: paths.stem },
			}),
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'No reservation for "x"' });
	});
	it("a completion callback reads the pathname from the blob", async () => {
		const res = await callRoute(
			POST,
			asEditorOf(ACCOUNT),
			jsonPost("/api/upload", {
				type: "blob.upload-completed",
				payload: { blob: { pathname: paths.recording, url: "https://x" }, tokenPayload: null },
			}),
		);
		expect(res.status).toBe(200);
		expect(blob.recordingAccess).toHaveBeenCalled();
	});
});

describe("onBeforeGenerateToken: stems, demos and MIDI (membership of the song's account)", () => {
	beforeEach(() => {
		givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
		data.findUploadingStem.mockResolvedValue({ id: STEM, contentType: "audio/wav" });
	});
	it("an editor gets a token for the reserved stem: its type, the stem ceiling, the row in the payload", async () => {
		await expect(tokenFor(paths.stem)).resolves.toEqual({
			allowedContentTypes: ["audio/wav"],
			maximumSizeInBytes: STEM_MAX_BYTES,
			addRandomSuffix: false,
			allowOverwrite: true,
			tokenPayload: JSON.stringify({ id: STEM }),
		});
		expect(data.findUploadingStem).toHaveBeenCalledWith(ACCOUNT, paths.stem);
	});
	it("a viewer of the account is refused", async () => {
		await expect(tokenFor(paths.stem, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
	});
	it("a pathname nobody reserved is refused", async () => {
		givenRow("stem", null);
		await expect(tokenFor(paths.stem)).rejects.toMatchObject(httpError(404));
	});
	it("a pathname reserved by another account is refused", async () => {
		givenRow("stem", { accountId: OTHER_ACCOUNT, song: { projectId: PROJECT } });
		await expect(tokenFor(paths.stem)).rejects.toMatchObject(httpError(404));
		expect(data.findUploadingStem).not.toHaveBeenCalled();
	});
	it("a reservation already past uploading is refused", async () => {
		data.findUploadingStem.mockResolvedValue(null);
		await expect(tokenFor(paths.stem)).rejects.toThrow(/No reservation/);
	});
	it("a demo takes the demo row's type under the same ceiling", async () => {
		givenRow("stem", null);
		givenRow("demo", { accountId: ACCOUNT, song: { projectId: PROJECT } });
		data.findUploadingDemo.mockResolvedValue({ id: DEMO, contentType: "audio/mp4" });
		await expect(tokenFor(paths.demo)).resolves.toMatchObject({
			allowedContentTypes: ["audio/mp4"],
			maximumSizeInBytes: STEM_MAX_BYTES,
			tokenPayload: JSON.stringify({ id: DEMO }),
		});
		expect(data.findUploadingDemo).toHaveBeenCalledWith(ACCOUNT, paths.demo);
	});
	it("a MIDI file is always audio/midi with its own small ceiling", async () => {
		data.findStemByMidiPathname.mockResolvedValue({ id: STEM });
		await expect(tokenFor(paths.midi)).resolves.toMatchObject({
			allowedContentTypes: ["audio/midi"],
			maximumSizeInBytes: MIDI_MAX_BYTES,
			tokenPayload: JSON.stringify({ id: STEM }),
		});
	});
});

describe("onBeforeGenerateToken: takes (the recorder's own)", () => {
	beforeEach(() => {
		data.recordingOfPathname.mockResolvedValue({ id: RECORDING, accountId: ACCOUNT });
		data.userOwnsRecording.mockResolvedValue(true);
		data.findUploadingRecording.mockResolvedValue({ id: RECORDING, contentType: "audio/webm" });
	});
	it("the person who recorded it gets a take-sized token", async () => {
		await expect(tokenFor(paths.recording)).resolves.toMatchObject({
			allowedContentTypes: ["audio/webm"],
			maximumSizeInBytes: MAX_TAKE_BYTES,
			tokenPayload: JSON.stringify({ id: RECORDING }),
		});
		expect(data.userOwnsRecording).toHaveBeenCalledWith(ACCOUNT, expect.any(String), RECORDING);
	});
	it("someone else's take is refused, even for an owner of its account", async () => {
		data.userOwnsRecording.mockResolvedValue(false);
		await expect(tokenFor(paths.recording, asEditorOf(ACCOUNT, "owner"))).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("a multitrack take's source falls back to the recording-stem reservation", async () => {
		data.findUploadingRecording.mockResolvedValue(null);
		data.findUploadingRecordingStem.mockResolvedValue({ id: RSTEM, contentType: "audio/webm" });
		await expect(tokenFor(paths.recordingStem)).resolves.toMatchObject({
			maximumSizeInBytes: MAX_TAKE_BYTES,
			tokenPayload: JSON.stringify({ id: RSTEM }),
		});
		expect(data.findUploadingRecordingStem).toHaveBeenCalledWith(ACCOUNT, paths.recordingStem);
	});
});

describe("onBeforeGenerateToken: Studio sources (the song's maker)", () => {
	beforeEach(() => {
		data.studioSourceOfPathname.mockResolvedValue({
			id: SOURCE,
			ideaId: IDEA,
			status: "uploading",
			contentType: "audio/wav",
		});
		givenRow("idea", { accountId: ACCOUNT });
		data.userOwnsIdea.mockResolvedValue(true);
	});
	it("the maker gets a take-sized token for the reserved type", async () => {
		await expect(tokenFor(paths.studio)).resolves.toEqual({
			allowedContentTypes: ["audio/wav"],
			maximumSizeInBytes: MAX_TAKE_BYTES,
			addRandomSuffix: false,
			allowOverwrite: true,
			tokenPayload: JSON.stringify({ id: SOURCE }),
		});
	});
	it("another member of the account is refused", async () => {
		data.userOwnsIdea.mockResolvedValue(false);
		await expect(tokenFor(paths.studio)).rejects.toMatchObject(httpError(404));
	});
	it("a source already uploaded, or never reserved, is refused", async () => {
		data.studioSourceOfPathname.mockResolvedValue({ id: SOURCE, ideaId: IDEA, status: "ready" });
		await expect(tokenFor(paths.studio)).rejects.toThrow(/No reservation/);
		data.studioSourceOfPathname.mockResolvedValue(null);
		await expect(tokenFor(paths.studio)).rejects.toThrow(/No reservation/);
	});
});

describe("onBeforeGenerateToken: drum samples", () => {
	beforeEach(() => {
		data.accountOfDrumSamplePathname.mockResolvedValue(ACCOUNT);
		data.findUploadingDrumSample.mockResolvedValue({ id: SAMPLE, contentType: "audio/wav" });
	});
	it("an editor of the account uploads its kit's sample under the sample ceiling", async () => {
		await expect(tokenFor(paths.kit)).resolves.toMatchObject({
			allowedContentTypes: ["audio/wav"],
			maximumSizeInBytes: DRUM_SAMPLE_MAX_BYTES,
			tokenPayload: JSON.stringify({ id: SAMPLE }),
		});
	});
	it("a viewer is refused", async () => {
		await expect(tokenFor(paths.kit, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
	});
	it("a kit pathname nobody reserved is refused", async () => {
		data.accountOfDrumSamplePathname.mockResolvedValue(null);
		await expect(tokenFor(paths.kit)).rejects.toThrow(/No reservation/);
	});
	it("a site kit's sample needs the system admin", async () => {
		await expect(tokenFor(paths.siteKit)).rejects.toMatchObject(httpError(404));
		await expect(tokenFor(paths.siteKit, asSystemAdmin())).resolves.toMatchObject({
			maximumSizeInBytes: DRUM_SAMPLE_MAX_BYTES,
		});
	});
});

describe("onBeforeGenerateToken: attachments and notation", () => {
	it("an attachment allows the browser's labels and the ceiling of its kind", async () => {
		givenRow("songFile", { accountId: ACCOUNT, projectId: PROJECT });
		data.findUploadingFile.mockResolvedValue({ id: FILE, kind: "pdf" });
		await expect(tokenFor(paths.file)).resolves.toMatchObject({
			allowedContentTypes: FILE_CONTENT_TYPES,
			maximumSizeInBytes: FILE_MAX_BYTES.pdf,
			tokenPayload: JSON.stringify({ id: FILE }),
		});
		expect(data.findUploadingFile).toHaveBeenCalledWith(ACCOUNT, paths.file);
	});
	it("a notation file allows MusicXML's many labels under its own ceiling", async () => {
		givenRow("songNotation", { accountId: ACCOUNT, song: { projectId: PROJECT } });
		data.findUploadingNotation.mockResolvedValue({ id: NOTATION });
		await expect(tokenFor(paths.notation)).resolves.toMatchObject({
			allowedContentTypes: NOTATION_CONTENT_TYPES,
			maximumSizeInBytes: NOTATION_MAX_BYTES,
			tokenPayload: JSON.stringify({ id: NOTATION }),
		});
	});
	it("an attachment nobody reserved is refused", async () => {
		givenRow("songFile", { accountId: ACCOUNT, projectId: PROJECT });
		data.findUploadingFile.mockResolvedValue(null);
		await expect(tokenFor(paths.file)).rejects.toThrow(/No reservation/);
	});
});

describe("onUploadCompleted records the URL on the row the pathname names", () => {
	const url = "https://store.public.blob.vercel-storage.com/x";
	const cases: [keyof typeof paths, string][] = [
		["kit", "recordDrumSampleUrl"],
		["midi", "recordStemMidiUrl"],
		["demo", "recordDemoUrl"],
		["file", "recordFileUrl"],
		["notation", "recordNotationUrl"],
		["recording", "recordRecordingUrl"],
		["studio", "recordStudioSourceUrl"],
		["stem", "recordStemUrl"],
	];
	for (const [kind, fn] of cases) {
		it(`${kind} → ${fn}`, async () => {
			givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
			const options = await optionsFor(paths[kind]);
			await options.onUploadCompleted({ blob: { pathname: paths[kind], url } });
			expect(data[fn]).toHaveBeenCalledWith(paths[kind], url);
			for (const [, other] of cases) if (other !== fn) expect(data[other]).not.toHaveBeenCalled();
		});
	}
});
