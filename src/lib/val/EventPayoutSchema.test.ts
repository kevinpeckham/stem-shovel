import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	EventPayoutAddSchema,
	EventPayoutIdSchema,
	EventPayoutUpdateSchema,
} from "./EventPayoutSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const USER = "U1StGXR8_Z5jdHi6B-myT";
const issues = (schema: v.GenericSchema, input: unknown) =>
	(v.safeParse(schema, input).issues ?? []).map((i) => ({
		key: v.getDotPath(i),
		message: i.message,
	}));

describe("EventPayoutAddSchema", () => {
	test("a member's payout: the amount in cents, name and note default empty", () => {
		expect(v.parse(EventPayoutAddSchema, { eventId: ID, userId: USER, amount: "120.5" })).toEqual({
			eventId: ID,
			userId: USER,
			name: "",
			amount: 12050,
			note: "",
		});
	});
	test("a named payee without a member", () => {
		expect(
			v.parse(EventPayoutAddSchema, {
				eventId: ID,
				name: " Sound guy ",
				amount: "50",
				note: "cash",
			}),
		).toEqual({ eventId: ID, userId: "", name: "Sound guy", amount: 5000, note: "cash" });
	});
	test("needs a member or a name, keyed to the name", () => {
		expect(
			issues(EventPayoutAddSchema, { eventId: ID, userId: "", name: " ", amount: "5" }),
		).toEqual([{ key: "name", message: "Pick a member or type a name" }]);
	});
	test("needs an amount that reads as one", () => {
		expect(issues(EventPayoutAddSchema, { eventId: ID, name: "Gas", amount: "" })).toEqual([
			{ key: "amount", message: "Enter the amount" },
		]);
		expect(issues(EventPayoutAddSchema, { eventId: ID, name: "Gas", amount: "lots" })).toEqual([
			{ key: "amount", message: "Enter an amount like 450 or 450.50" },
		]);
	});
	test("refuses a user id that is not an id, and long text", () => {
		expect(
			v.safeParse(EventPayoutAddSchema, { eventId: ID, userId: "bob!", amount: "5" }).success,
		).toBe(false);
		expect(
			v.safeParse(EventPayoutAddSchema, { eventId: ID, name: "x".repeat(121), amount: "5" })
				.success,
		).toBe(false);
		expect(
			v.safeParse(EventPayoutAddSchema, {
				eventId: ID,
				name: "a",
				note: "x".repeat(401),
				amount: "5",
			}).success,
		).toBe(false);
	});
});

describe("EventPayoutUpdateSchema", () => {
	test("the id in place of the event's, the same rules", () => {
		expect(v.parse(EventPayoutUpdateSchema, { id: ID, name: "Gas", amount: "-20" })).toEqual({
			id: ID,
			userId: "",
			name: "Gas",
			amount: -2000,
			note: "",
		});
		expect(issues(EventPayoutUpdateSchema, { id: ID, amount: "5" })).toEqual([
			{ key: "name", message: "Pick a member or type a name" },
		]);
	});
});

describe("EventPayoutIdSchema", () => {
	test("an id", () => {
		expect(v.safeParse(EventPayoutIdSchema, { id: ID }).success).toBe(true);
		expect(v.safeParse(EventPayoutIdSchema, { id: "" }).success).toBe(false);
	});
});
