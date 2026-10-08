import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	data,
	givenRow,
	resetRemoteMocks,
	type Mocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";
import { MIDI_MAX_BYTES } from "#lib/constants/midiFormats.js";

/** Step 1 of a MIDI upload for a stem: an editor of the stem's account reserves the pathname. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const body = { filename: "Bass.MID", sizeBytes: 12_000 };
const row = {
	stemId: STEM,
	pathname: `accounts/${ACCOUNT}/songs/${SONG}/${STEM}.mid`,
	contentType: "audio/midi",
};
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/stems/${STEM}/midi`, b), { id: STEM });
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store a reservation goes to. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reserveStemMidi.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/stems/[id]/midi", () => {
	it("400 for a body that is not JSON, and for a size that is not a whole number of bytes", async () => {
		await expect(post("{not json")).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 1.5 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: -3 })).rejects.toMatchObject(httpError(400));
	});
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.reserveStemMidi).not.toHaveBeenCalled();
	});
	it("400 without a filename or a numeric sizeBytes", async () => {
		await expect(post({ sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "12000" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, filename: "" })).rejects.toMatchObject(httpError(400));
	});
	it("415 for a file that is not .mid or .midi", async () => {
		await expect(post({ ...body, filename: "bass.wav" })).rejects.toMatchObject(httpError(415));
		await expect(post({ ...body, filename: "bass" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the MIDI size cap", async () => {
		await expect(post({ ...body, sizeBytes: MIDI_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
		expect(data.reserveStemMidi).not.toHaveBeenCalled();
	});
	it("404 for an unknown stem", async () => {
		givenRow("stem", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("404 when the data layer finds no stem to reserve for", async () => {
		data.reserveStemMidi.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves the MIDI pathname (type from the extension) and learns where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ stemId: STEM, pathname: row.pathname, access: "public" });
		expect(data.reserveStemMidi).toHaveBeenCalledWith(ACCOUNT, STEM, {
			filename: "Bass.MID",
			contentType: "audio/midi",
			sizeBytes: 12_000,
		});
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
	});
	it(".midi is accepted too, and the store answers private when the song is", async () => {
		relocate.accessOfPathname.mockResolvedValue("private");
		const res = await post({ ...body, filename: "lead.midi" });
		expect(await res.json()).toMatchObject({ access: "private" });
		expect(data.reserveStemMidi).toHaveBeenCalledWith(
			ACCOUNT,
			STEM,
			expect.objectContaining({ filename: "lead.midi", contentType: "audio/midi" }),
		);
	});
	it("an admin passes without the project lookup", async () => {
		const res = await post(body, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
});
