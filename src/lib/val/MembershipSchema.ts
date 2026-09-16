import * as v from "valibot";
import { MemberRoleSchema } from "./MemberRoleSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Leaving an account, removing a member, or changing their role (account settings). */
export const MembershipSchema = v.object({ accountId: NanoIdSchema, userId: NanoIdSchema });
export const MemberRoleChangeSchema = v.object({
	accountId: NanoIdSchema,
	userId: NanoIdSchema,
	role: MemberRoleSchema,
});
export const LeaveAccountSchema = v.object({ accountId: NanoIdSchema });
