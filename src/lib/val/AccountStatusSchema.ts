import * as v from "valibot";

export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

export const AccountStatusSchema = v.picklist(ACCOUNT_STATUSES);

export type AccountStatus = v.InferOutput<typeof AccountStatusSchema>;
