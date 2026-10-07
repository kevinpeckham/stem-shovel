import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asOwnerOf,
	asSignedOut,
	asSystemAdmin,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** User docs and the blog are written by system admins only (reading is public). */
const docs = await import("./userDocs.remote");

const DOC = fakeId("doc-one");
const SYSADMIN = fakeId("sysadmin");

beforeEach(resetRemoteMocks);

const cases = [
	{
		name: "createUserDoc",
		fn: docs.createUserDoc,
		input: { title: "Help" },
		arrange: () => data.createUserDoc.mockResolvedValue({ kind: "doc", slug: "help" }),
		dataFn: "createUserDoc",
		args: [SYSADMIN, "Help", "doc"],
		outcome: redirected("/docs/help/edit"),
	},
	{
		name: "updateUserDoc",
		fn: docs.updateUserDoc,
		input: { id: DOC, title: "Help", slug: "help" },
		arrange: () =>
			data.updateUserDocMeta.mockResolvedValue({ ok: true, doc: { kind: "post", slug: "help" } }),
		dataFn: "updateUserDocMeta",
		args: [DOC, { title: "Help", slug: "help", sortOrder: 0, published: false }],
		outcome: redirected("/blog/help"),
	},
	{
		name: "deleteUserDoc",
		fn: docs.deleteUserDoc,
		input: { id: DOC },
		arrange: () => data.deleteUserDoc.mockResolvedValue({ kind: "doc" }),
		dataFn: "deleteUserDoc",
		args: [DOC],
		outcome: redirected("/docs"),
	},
	{
		name: "saveUserDoc",
		fn: docs.saveUserDoc,
		input: { id: DOC, markdown: "# Help" },
		arrange: () => data.saveUserDoc.mockResolvedValue({ ok: true, version: 1, changed: true }),
		dataFn: "saveUserDoc",
		args: [DOC, SYSADMIN, "# Help", { confirmEmpty: false }],
		outcome: { version: 1, changed: true },
	},
];

for (const c of cases) {
	const run = () => {
		c.arrange();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("404 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for an account owner who is not the operator", async () => {
			asOwnerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("the system admin does it, as themselves", async () => {
			asSystemAdmin();
			if ("status" in c.outcome) await expect(run()).rejects.toMatchObject(c.outcome);
			else await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}
