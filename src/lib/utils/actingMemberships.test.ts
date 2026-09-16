import { describe, expect, test } from "vite-plus/test";
import { realMemberships, withActingMemberships } from "./actingMemberships";

describe("withActingMemberships", () => {
	const real = [{ accountId: "a", slug: "mine", name: "Mine", role: "member" }];
	const accounts = [
		{ id: "a", slug: "mine", name: "Mine" },
		{ id: "b", slug: "band", name: "The Band" },
	];
	test("adds every other account as an acting owner and keeps the real ones as they are", () => {
		const all = withActingMemberships(real, accounts);
		expect(all).toEqual([
			real[0],
			{ accountId: "b", slug: "band", name: "The Band", role: "owner", actingAs: true },
		]);
		expect(realMemberships(all)).toEqual(real);
	});
	test("nothing extra when the person already belongs everywhere", () => {
		expect(withActingMemberships(real, accounts.slice(0, 1))).toEqual(real);
	});
});
