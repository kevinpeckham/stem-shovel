import { describe, expect, test } from "vite-plus/test";
import { pickAccount } from "./currentAccount";

const ms = [
	{ accountId: "a", slug: "band", role: "member" },
	{ accountId: "b", slug: "mine", role: "owner" },
	{ accountId: "c", slug: "other", role: "admin" },
];

describe("pickAccount", () => {
	test("the remembered account wins", () => {
		expect(pickAccount(ms, "other")?.slug).toBe("other");
	});
	test("otherwise the first owned account", () => {
		expect(pickAccount(ms, null)?.slug).toBe("mine");
		expect(pickAccount(ms, "gone")?.slug).toBe("mine");
	});
	test("otherwise the first membership", () => {
		expect(pickAccount(ms.slice(0, 1), null)?.slug).toBe("band");
	});
	test("no memberships, no account", () => {
		expect(pickAccount([], "mine")).toBeNull();
	});
});
