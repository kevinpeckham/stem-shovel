import * as v from "valibot";

/**
 * Subscription tiers. Only "free" exists today (every account is a free
 * account for life); paid data tiers and premium features come later and
 * are added here. Founder status is a separate flag on the account, not a
 * plan: it overlays whatever plan the account has.
 */
export const ACCOUNT_PLANS = ["free"] as const;

export const AccountPlanSchema = v.picklist(ACCOUNT_PLANS);

export type AccountPlan = v.InferOutput<typeof AccountPlanSchema>;
