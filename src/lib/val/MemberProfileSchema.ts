import * as v from "valibot";
import { boundedText } from "./BoundedTextSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A member's profile in one account (docs/band-plan.md, "The band
 * directory"): a phone, what they play ("guitar, vocals") and notes, set
 * by the member or an admin. Each left out is "".
 */
export const MemberProfileUpdateSchema = v.object({
	accountId: NanoIdSchema,
	userId: NanoIdSchema,
	phone: v.optional(boundedText(60, "phone number"), ""),
	instruments: v.optional(boundedText(200, "instruments"), ""),
	notes: v.optional(boundedText(2000, "notes"), ""),
});
export type MemberProfileUpdate = v.InferOutput<typeof MemberProfileUpdateSchema>;
/** The fields a profile write takes: phone, instruments and notes. */
export type MemberProfileFields = Omit<MemberProfileUpdate, "accountId" | "userId">;
