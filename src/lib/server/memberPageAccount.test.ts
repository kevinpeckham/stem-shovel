import { describe, expect, test, vi } from "vite-plus/test";

const access = vi.hoisted(() => ({
	requireSignedIn: vi.fn(),
	requireMember: vi.fn(),
}));
vi.mock("#lib/server/access.js", () => access);

import { memberPageAccount } from "./memberPageAccount";

describe("memberPageAccount", () => {
	test("checks sign-in before reading the layout, then membership of the account, and returns it", async () => {
		const calls: string[] = [];
		access.requireSignedIn.mockImplementation(() => calls.push("signedIn"));
		access.requireMember.mockImplementation((_l, id) => calls.push(`member:${id}`));
		const account = { id: "acc1", slug: "band", name: "Band" };
		const locals = {} as App.Locals;
		const url = new URL("https://x.test/band/shows");
		const got = await memberPageAccount({
			parent: async () => {
				calls.push("parent");
				return { account };
			},
			locals,
			url,
		});
		expect(got).toBe(account);
		expect(calls).toEqual(["signedIn", "parent", "member:acc1"]);
		expect(access.requireSignedIn).toHaveBeenCalledWith(locals, url);
	});
	test("a failed sign-in check stops before the layout is read", async () => {
		access.requireSignedIn.mockImplementation(() => {
			throw new Error("redirect");
		});
		const parent = vi.fn();
		await expect(
			memberPageAccount({ parent, locals: {} as App.Locals, url: new URL("https://x.test/") }),
		).rejects.toThrow("redirect");
		expect(parent).not.toHaveBeenCalled();
	});
});
