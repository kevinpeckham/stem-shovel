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
import { blob, data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of pictures: an editor of the account, found from the artist or project, or named for the account itself. */
const images = await import("./images.remote");

const PROJECT = fakeId("proj-one");
const ARTIST = fakeId("artist-one");
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("project", { accountId: ACCOUNT });
	givenRow("artist", { accountId: ACCOUNT });
	blob.putBlob.mockResolvedValue({ url: "https://blob/new.png" });
	data.projectIsPrivate.mockResolvedValue(false);
	data.setImage.mockResolvedValue("https://blob/old.png");
});

const targets = [
	{ kind: "project", id: PROJECT },
	{ kind: "artist", id: ARTIST },
	{ kind: "account", id: ACCOUNT },
];

describe("removeImage", () => {
	for (const t of targets) {
		describe(`a ${t.kind} picture`, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(images.removeImage, t)).rejects.toMatchObject(httpError(401));
			});
			it("404 for an outsider and for a viewer", async () => {
				asOutsider();
				await expect(call(images.removeImage, t)).rejects.toMatchObject(httpError(404));
				asViewerOf(ACCOUNT);
				await expect(call(images.removeImage, t)).rejects.toMatchObject(httpError(404));
				expect(data.setImage).not.toHaveBeenCalled();
			});
			it("an editor clears it within the account and deletes the old file", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(images.removeImage, t)).resolves.toEqual({ removed: true });
				expect(data.setImage).toHaveBeenCalledWith(t.kind, ACCOUNT, t.id, null);
				expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/old.png"]);
			});
		});
	}
});

describe("setImage", () => {
	it("404 for a viewer, nothing uploaded", async () => {
		asViewerOf(ACCOUNT);
		await expect(
			call(images.setImage, { kind: "project", id: PROJECT, image: png() }),
		).rejects.toMatchObject(httpError(404));
		expect(blob.putBlob).not.toHaveBeenCalled();
	});
	it("404 for an outsider", async () => {
		asOutsider();
		await expect(
			call(images.setImage, { kind: "account", id: ACCOUNT, image: png() }),
		).rejects.toMatchObject(httpError(404));
		expect(blob.putBlob).not.toHaveBeenCalled();
	});
	it("an editor stores it under the account and points the row at it", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(images.setImage, { kind: "project", id: PROJECT, image: png() }),
		).resolves.toEqual({ url: "https://blob/new.png" });
		expect(blob.putBlob).toHaveBeenCalledWith(
			`accounts/${ACCOUNT}/project/${PROJECT}.png`,
			expect.anything(),
			"image/png",
			"public",
		);
		expect(data.setImage).toHaveBeenCalledWith("project", ACCOUNT, PROJECT, "https://blob/new.png");
	});
	it("a private project's picture goes to the private store", async () => {
		asEditorOf(ACCOUNT);
		data.projectIsPrivate.mockResolvedValue(true);
		await call(images.setImage, { kind: "project", id: PROJECT, image: png() });
		expect(data.projectIsPrivate).toHaveBeenCalledWith(ACCOUNT, PROJECT);
		expect(blob.putBlob).toHaveBeenCalledWith(
			expect.any(String),
			expect.anything(),
			"image/png",
			"private",
		);
	});
});
