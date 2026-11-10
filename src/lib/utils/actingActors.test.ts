import { describe, expect, test } from "vite-plus/test";
import { actingActors } from "./actingActors";

describe("actingActors", () => {
	test("a super admin without a real membership is acting", () => {
		const people = [
			{ id: "kev", isSuperAdmin: true },
			{ id: "pat", isSuperAdmin: false },
		];
		expect([...actingActors(people, ["pat"])]).toEqual(["kev"]);
	});
	test("a super admin who really belongs to the account is a member, not acting", () => {
		expect(actingActors([{ id: "kev", isSuperAdmin: true }], ["kev"]).size).toBe(0);
	});
	test("a plain user is never acting, member or not", () => {
		expect(actingActors([{ id: "pat", isSuperAdmin: false }], []).size).toBe(0);
		expect(actingActors([], ["pat"]).size).toBe(0);
	});
});
