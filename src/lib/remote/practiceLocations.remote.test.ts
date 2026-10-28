import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the practice location remote functions (docs/band-plan.md, "Event"): an editor of the account. */
const locations = await import("./practiceLocations.remote");

const LOCATION = fakeId("location-one");
const ROW = {
	id: LOCATION,
	name: "The garage",
	address: "",
	notes: "",
	eventCount: 0,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};
const FIELDS = { name: "The garage", address: "12 Elm St", notes: "" };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("practiceLocation", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "createPracticeLocation",
		fn: locations.createPracticeLocation,
		input: { accountId: ACCOUNT, name: " The garage ", address: "12 Elm St" },
		arrange: () => data.createPracticeLocation.mockResolvedValue(ROW),
		dataFn: "createPracticeLocation",
		args: [ACCOUNT, USER, FIELDS],
		outcome: ROW,
		missing: false,
	},
	{
		name: "updatePracticeLocation",
		fn: locations.updatePracticeLocation,
		input: { id: LOCATION, ...FIELDS },
		arrange: () => data.updatePracticeLocation.mockResolvedValue(ROW),
		dataFn: "updatePracticeLocation",
		args: [ACCOUNT, LOCATION, FIELDS],
		outcome: { ok: true },
		missing: true,
	},
	{
		name: "deletePracticeLocation",
		fn: locations.deletePracticeLocation,
		input: { id: LOCATION },
		arrange: () => data.deletePracticeLocation.mockResolvedValue(true),
		dataFn: "deletePracticeLocation",
		args: [ACCOUNT, LOCATION],
		outcome: { ok: true },
		missing: true,
	},
];

for (const c of cases) {
	const run = () => {
		c.arrange();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("401 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(401));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a member of another account", async () => {
			asOutsider();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a viewer of the account", async () => {
			asViewerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		if (c.missing)
			it("404 for a location that does not exist", async () => {
				asEditorOf(ACCOUNT);
				givenRow("practiceLocation", null);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
		it("an editor reaches the data layer scoped by the account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

describe("refusals from the data layer", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("createPracticeLocation answers 409 when full or a duplicate", async () => {
		data.createPracticeLocation.mockResolvedValue("full");
		await expect(
			call(locations.createPracticeLocation, { accountId: ACCOUNT, name: "The garage" }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This account holds as many practice locations as it may." },
		});
		data.createPracticeLocation.mockResolvedValue("duplicate");
		await expect(
			call(locations.createPracticeLocation, { accountId: ACCOUNT, name: "the GARAGE" }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "A location with that name is already here." },
		});
	});
	it("a blank name is refused before the data layer", async () => {
		await expect(
			call(locations.createPracticeLocation, { accountId: ACCOUNT, name: " " }),
		).rejects.toBeTruthy();
		expect(data.createPracticeLocation).not.toHaveBeenCalled();
	});
	it("updatePracticeLocation: a duplicate lands on the name; nothing found is 404", async () => {
		data.updatePracticeLocation.mockResolvedValue("duplicate");
		await expect(
			call(locations.updatePracticeLocation, { id: LOCATION, ...FIELDS }),
		).rejects.toMatchObject({
			issues: [{ path: ["name"], message: "A location with that name is already here." }],
		});
		data.updatePracticeLocation.mockResolvedValue(null);
		await expect(
			call(locations.updatePracticeLocation, { id: LOCATION, ...FIELDS }),
		).rejects.toMatchObject(httpError(404));
	});
	it("deletePracticeLocation answers 409 while practices are there, 404 when nothing is found", async () => {
		data.deletePracticeLocation.mockResolvedValue("used");
		await expect(call(locations.deletePracticeLocation, { id: LOCATION })).rejects.toMatchObject({
			status: 409,
			body: { message: "This location has practices on the calendar; move them first." },
		});
		data.deletePracticeLocation.mockResolvedValue(false);
		await expect(call(locations.deletePracticeLocation, { id: LOCATION })).rejects.toMatchObject(
			httpError(404),
		);
	});
});
