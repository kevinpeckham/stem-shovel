import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asSystemAdmin,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import { blob, data, resetRemoteMocks } from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of a drum sample upload: whoever may edit the kit reports the blob URL; the row is marked ready. */
const { POST } = await import("./+server");

const KIT = fakeId("kit-one");
const SAMPLE = fakeId("sample-one");
const pathname = `accounts/${ACCOUNT}/kits/${KIT}/${SAMPLE}.wav`;
const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
const body = { url };
const owner = { kitId: KIT, accountId: ACCOUNT, pathname };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/drum-samples/${SAMPLE}/ready`, b), { id: SAMPLE });

beforeEach(() => {
	resetRemoteMocks();
	data.drumSampleOwner.mockResolvedValue(owner);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markDrumSampleReady.mockResolvedValue({ id: SAMPLE, kitId: KIT, voice: "snare" });
});

describe("POST /api/drum-samples/[id]/ready", () => {
	it("401 signed out, 404 for an outsider and for a viewer of an account kit", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.markDrumSampleReady).not.toHaveBeenCalled();
	});
	it("400 without an https URL", async () => {
		await expect(post({})).rejects.toMatchObject(httpError(400));
		await expect(post({ url: "http://x" })).rejects.toMatchObject(httpError(400));
		expect(data.drumSampleOwner).not.toHaveBeenCalled();
	});
	it("404 for an unknown sample (looked up before the sign-in check)", async () => {
		data.drumSampleOwner.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(404));
	});
	it("400 when the URL is another file", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(data.markDrumSampleReady).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markDrumSampleReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor marks an account kit's sample ready", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.drumSampleOwner).toHaveBeenCalledWith(SAMPLE);
		expect(data.markDrumSampleReady).toHaveBeenCalledWith(SAMPLE, url);
	});
	it("an account admin passes too", async () => {
		const res = await post(body, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
	describe("a site kit's sample (no account)", () => {
		const sitePathname = `site/kits/acoustic/${SAMPLE}.wav`;
		const siteUrl = `https://store.public.blob.vercel-storage.com/${sitePathname}`;
		beforeEach(() => {
			data.drumSampleOwner.mockResolvedValue({
				kitId: "acoustic",
				accountId: null,
				pathname: sitePathname,
			});
		});
		it("401 signed out, 404 for a member of any account", async () => {
			await expect(post({ url: siteUrl }, asSignedOut())).rejects.toMatchObject(httpError(401));
			await expect(post({ url: siteUrl }, asEditorOf(ACCOUNT))).rejects.toMatchObject(
				httpError(404),
			);
			await expect(post({ url: siteUrl }, asAdminOf(ACCOUNT))).rejects.toMatchObject(
				httpError(404),
			);
			expect(data.markDrumSampleReady).not.toHaveBeenCalled();
		});
		it("a system admin marks it ready", async () => {
			const res = await post({ url: siteUrl }, asSystemAdmin());
			expect(await res.json()).toEqual({ ok: true });
			expect(blob.isOurBlobUrl).toHaveBeenCalledWith(siteUrl, sitePathname);
			expect(data.markDrumSampleReady).toHaveBeenCalledWith(SAMPLE, siteUrl);
		});
	});
});
