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

/** Authorization of the contact remote functions (docs/band-plan.md, "The band directory"): an editor of the account. */
const contacts = await import("./contacts.remote");

const CONTACT = fakeId("contact-one");
const FIELDS = {
	name: "Dana Reyes",
	role: "Promoter",
	phone: "555-0100",
	email: "dana@example.com",
	address: "",
	notes: "",
};
const ROW = { id: CONTACT, ...FIELDS, eventCount: 0 };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("contact", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "createContact",
		fn: contacts.createContact,
		input: { accountId: ACCOUNT, ...FIELDS, name: " Dana Reyes " },
		arrange: () => data.createContact.mockResolvedValue(ROW),
		dataFn: "createContact",
		args: [ACCOUNT, USER, FIELDS],
		outcome: ROW,
		missing: false,
	},
	{
		name: "updateContact",
		fn: contacts.updateContact,
		input: { id: CONTACT, ...FIELDS },
		arrange: () => data.updateContact.mockResolvedValue(ROW),
		dataFn: "updateContact",
		args: [ACCOUNT, CONTACT, FIELDS],
		outcome: { ok: true },
		missing: true,
	},
	{
		name: "deleteContact",
		fn: contacts.deleteContact,
		input: { id: CONTACT },
		arrange: () => data.deleteContact.mockResolvedValue(true),
		dataFn: "deleteContact",
		args: [ACCOUNT, CONTACT],
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
			it("404 for a contact that does not exist", async () => {
				asEditorOf(ACCOUNT);
				givenRow("contact", null);
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

describe("refusals", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("createContact answers 409 when the account is full", async () => {
		data.createContact.mockResolvedValue("full");
		await expect(
			call(contacts.createContact, { accountId: ACCOUNT, name: "Sam" }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This account holds as many contacts as it may." },
		});
	});
	it("a blank name or a bad email is refused before the data layer", async () => {
		await expect(
			call(contacts.createContact, { accountId: ACCOUNT, name: " " }),
		).rejects.toBeTruthy();
		await expect(
			call(contacts.createContact, { accountId: ACCOUNT, name: "Sam", email: "sam at home" }),
		).rejects.toBeTruthy();
		expect(data.createContact).not.toHaveBeenCalled();
	});
	it("updateContact and deleteContact answer 404 when the data layer finds nothing", async () => {
		data.updateContact.mockResolvedValue(null);
		await expect(call(contacts.updateContact, { id: CONTACT, ...FIELDS })).rejects.toMatchObject(
			httpError(404),
		);
		data.deleteContact.mockResolvedValue(false);
		await expect(call(contacts.deleteContact, { id: CONTACT })).rejects.toMatchObject(
			httpError(404),
		);
	});
});
