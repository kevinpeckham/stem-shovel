import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const ACCOUNT_ACTIONS = ["suspend", "reactivate", "delete", "founder", "unfounder"] as const;
export const AccountActionSchema = v.picklist(ACCOUNT_ACTIONS);

/** A system admin acting on one account from /admin ("founder"/"unfounder" need a super admin). */
export const AccountAdminSchema = v.object({ id: NanoIdSchema, action: AccountActionSchema });

/** A system admin's storage override for one account, in GB; blank = the plan's limit. */
export const AccountStorageLimitSchema = v.object({
	id: NanoIdSchema,
	gigabytes: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.transform((s) => (s === "" ? null : Number(s))),
			v.union([
				v.null(),
				v.pipe(
					v.number("Gigabytes must be a number."),
					v.minValue(0, "Gigabytes cannot be negative."),
					v.maxValue(100_000, "That is more than the store."),
				),
			]),
		),
		"",
	),
});
