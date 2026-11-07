import * as v from "valibot";
import { boundedText } from "./BoundedTextSchema";
import { MoneyRequiredSchema } from "./MoneySchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Trimmed text of at most `max` characters, "" when left out. */
const text = (max: number, what: string) => v.optional(boundedText(max, what), "");

/** The member paid (a user id), or "" when the payee is not a member. */
const PayeeSchema = v.optional(v.union([v.literal(""), NanoIdSchema]), "");

/** One payout's own words (docs/band-plan.md, "The books"): the member or a name, the amount in cents, a note. */
const payoutEntries = {
	userId: PayeeSchema,
	name: text(120, "name"),
	amount: MoneyRequiredSchema,
	note: text(400, "note"),
};

/** A payout needs a member or a name; the issue is the name field's. */
const MEMBER_OR_NAME = "Pick a member or type a name";

/** A new payout of the event, after its others. */
export const EventPayoutAddSchema = v.pipe(
	v.object({ eventId: NanoIdSchema, ...payoutEntries }),
	v.forward(
		v.check((o) => o.userId !== "" || o.name !== "", MEMBER_OR_NAME),
		["name"],
	),
);
export type EventPayoutAdd = v.InferOutput<typeof EventPayoutAddSchema>;

/** A payout's new words, in full. */
export const EventPayoutUpdateSchema = v.pipe(
	v.object({ id: NanoIdSchema, ...payoutEntries }),
	v.forward(
		v.check((o) => o.userId !== "" || o.name !== "", MEMBER_OR_NAME),
		["name"],
	),
);
export type EventPayoutUpdate = v.InferOutput<typeof EventPayoutUpdateSchema>;
/** The fields `addEventPayout`/`updateEventPayout` write. */
export type EventPayoutFields = Omit<EventPayoutUpdate, "id">;

export const EventPayoutIdSchema = v.object({ id: NanoIdSchema });
export type EventPayoutId = v.InferOutput<typeof EventPayoutIdSchema>;
