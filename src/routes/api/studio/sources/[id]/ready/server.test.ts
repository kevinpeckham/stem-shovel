import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asSignedOut,
	fakeId,
	httpError,
} from "../../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	resetRemoteMocks,
} from "../../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of saving a Studio source: owned through its song, and only the reserved file's URL is accepted. */
const { POST } = await import("./+server");

const IDEA = fakeId("idea-one");
const SOURCE = fakeId("src-one");
const pathname = `accounts/${ACCOUNT}/studio/${IDEA}/${SOURCE}.wav`;
const ready = {
	url: `https://store.private.blob.vercel-storage.com/${pathname}`,
	peaks: [0, 0.5, 1],
	durationSeconds: 12.5,
};
const post = (body: unknown = ready) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost(`/api/studio/sources/${SOURCE}/ready`, body), {
		id: SOURCE,
	});

beforeEach(() => {
	resetRemoteMocks();
	data.studioSourceOwner.mockResolvedValue({ accountId: ACCOUNT, ideaId: IDEA, pathname });
	givenRow("idea", { accountId: ACCOUNT });
	data.userOwnsIdea.mockResolvedValue(true);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markStudioSourceReady.mockResolvedValue({ id: SOURCE });
});

describe("POST /api/studio/sources/[id]/ready", () => {
	it("401 signed out", async () => {
		await expect(
			callRoute(POST, asSignedOut(), jsonPost("/", ready), { id: SOURCE }),
		).rejects.toMatchObject(httpError(401));
	});
	it("400 on a body that fails the schema (a peak over 1)", async () => {
		await expect(post({ ...ready, peaks: [2] })).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown source", async () => {
		data.studioSourceOwner.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("404 for a source of someone else's song", async () => {
		data.userOwnsIdea.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.markStudioSourceReady).not.toHaveBeenCalled();
	});
	it("400 for a URL that is not the reserved file in one of our stores", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(ready.url, pathname);
		expect(data.markStudioSourceReady).not.toHaveBeenCalled();
	});
	it("marks the source ready with the URL, peaks and length, scoped by the account", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.markStudioSourceReady).toHaveBeenCalledWith(ACCOUNT, SOURCE, ready);
	});
});
