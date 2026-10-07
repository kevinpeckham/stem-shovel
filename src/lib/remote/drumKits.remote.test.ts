import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asSystemAdmin,
	asUser,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of custom drum kits: an account's kits are its editors' to
 * keep and its members' to play; a site kit (no account) is the operator's.
 */
const kits = await import("./drumKits.remote");

const KIT = fakeId("kit-one");
const SAMPLE = fakeId("sample-one");
const SYSADMIN = fakeId("sysadmin");

beforeEach(() => {
	resetRemoteMocks();
	data.accountOfDrumKit.mockResolvedValue({ accountId: ACCOUNT });
	data.drumSampleOwner.mockResolvedValue({ kitId: KIT });
	data.listDrumKitsFor.mockResolvedValue([]);
	data.listDrumKitManifests.mockResolvedValue([]);
	data.createDrumKit.mockResolvedValue({ id: KIT, name: "Room" });
	data.renameDrumKit.mockResolvedValue({ id: KIT, name: "Hall" });
	data.setDrumSampleSource.mockResolvedValue({ id: SAMPLE, source: "FreePats" });
});

describe("listDrumKits and drumKitManifests", () => {
	const cases = [
		{ name: "listDrumKits", fn: kits.listDrumKits, dataFn: "listDrumKitsFor" },
		{ name: "drumKitManifests", fn: kits.drumKitManifests, dataFn: "listDrumKitManifests" },
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, { accountId: ACCOUNT })).rejects.toMatchObject(httpError(401));
			});
			it("404 for an account the caller is not in", async () => {
				asOutsider();
				await expect(call(c.fn, { accountId: ACCOUNT })).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("every member sees the account's kits, a viewer-role member too", async () => {
				asEditorOf(ACCOUNT);
				await expect(call(c.fn, { accountId: ACCOUNT })).resolves.toEqual([]);
				expect(data[c.dataFn]).toHaveBeenCalledWith(ACCOUNT);
				asViewerOf(ACCOUNT);
				await expect(call(c.fn, { accountId: ACCOUNT })).resolves.toEqual([]);
			});
			it("anyone signed in sees the site's kits", async () => {
				asUser();
				await expect(call(c.fn, {})).resolves.toEqual([]);
				expect(data[c.dataFn]).toHaveBeenCalledWith(null);
			});
		});
	}
});

describe("createDrumKit", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(
			call(kits.createDrumKit, { accountId: ACCOUNT, name: "Room" }),
		).rejects.toMatchObject(httpError(401));
	});
	it("404 for a viewer or an outsider of the account", async () => {
		asViewerOf(ACCOUNT);
		await expect(
			call(kits.createDrumKit, { accountId: ACCOUNT, name: "Room" }),
		).rejects.toMatchObject(httpError(404));
		asOutsider();
		await expect(
			call(kits.createDrumKit, { accountId: ACCOUNT, name: "Room" }),
		).rejects.toMatchObject(httpError(404));
		expect(data.createDrumKit).not.toHaveBeenCalled();
	});
	it("an editor makes one in the account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(kits.createDrumKit, { accountId: ACCOUNT, name: "Room" })).resolves.toEqual({
			id: KIT,
			name: "Room",
		});
		expect(data.createDrumKit).toHaveBeenCalledWith(ACCOUNT, USER, "Room");
	});
	it("a site kit takes the operator: 404 for an account owner", async () => {
		asEditorOf(ACCOUNT, "owner");
		await expect(call(kits.createDrumKit, { name: "Site" })).rejects.toMatchObject(httpError(404));
		expect(data.createDrumKit).not.toHaveBeenCalled();
		asSystemAdmin();
		await call(kits.createDrumKit, { name: "Site" });
		expect(data.createDrumKit).toHaveBeenCalledWith(null, SYSADMIN, "Site");
	});
});

describe("renameDrumKit, deleteDrumKit, setDrumSampleSource and deleteDrumSample", () => {
	const cases = [
		{
			name: "renameDrumKit",
			fn: kits.renameDrumKit,
			input: { id: KIT, name: "Hall" },
			dataFn: "renameDrumKit",
			args: (account: string | null) => [account, KIT, "Hall"],
		},
		{
			name: "deleteDrumKit",
			fn: kits.deleteDrumKit,
			input: { id: KIT },
			dataFn: "deleteDrumKit",
			args: (account: string | null) => [account, KIT],
		},
		{
			name: "setDrumSampleSource",
			fn: kits.setDrumSampleSource,
			input: { id: SAMPLE, source: "FreePats" },
			dataFn: "setDrumSampleSource",
			args: () => [SAMPLE, "FreePats"],
		},
		{
			name: "deleteDrumSample",
			fn: kits.deleteDrumSample,
			input: { id: SAMPLE },
			dataFn: "deleteDrumSample",
			args: () => [SAMPLE],
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			});
			it("404 for a viewer or an outsider of the kit's account", async () => {
				asViewerOf(ACCOUNT);
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				asOutsider();
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an editor of the kit's account does it", async () => {
				asEditorOf(ACCOUNT);
				await call(c.fn, c.input);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args(ACCOUNT));
			});
			it("a site kit: 404 for an account owner, the operator does it", async () => {
				data.accountOfDrumKit.mockResolvedValue({ accountId: null });
				asEditorOf(ACCOUNT, "owner");
				await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
				asSystemAdmin();
				await call(c.fn, c.input);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args(null));
			});
		});
	}
});
