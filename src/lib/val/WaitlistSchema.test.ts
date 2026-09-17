import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { WaitlistJoinSchema, WaitlistPrefsSchema } from "./WaitlistSchema";

describe("WaitlistJoinSchema", () => {
	test("normalises the address and defaults consent to off", () => {
		expect(v.parse(WaitlistJoinSchema, { email: "  Sam@Example.COM " })).toEqual({
			email: "sam@example.com",
			name: "",
			updates: false,
			website: "",
		});
	});
	test("needs a real address", () => {
		expect(v.safeParse(WaitlistJoinSchema, { email: "nope" }).success).toBe(false);
		expect(v.safeParse(WaitlistJoinSchema, { email: "" }).success).toBe(false);
	});
	test("anything in the honeypot is refused", () => {
		expect(v.safeParse(WaitlistJoinSchema, { email: "a@b.co", website: "x" }).success).toBe(false);
	});
});

describe("WaitlistPrefsSchema", () => {
	test("takes a 32-character token and a known action", () => {
		const token = "A".repeat(32);
		expect(v.safeParse(WaitlistPrefsSchema, { token, action: "updates-off" }).success).toBe(true);
		expect(v.safeParse(WaitlistPrefsSchema, { token: "short", action: "leave" }).success).toBe(
			false,
		);
		expect(v.safeParse(WaitlistPrefsSchema, { token, action: "spam" }).success).toBe(false);
	});
});
