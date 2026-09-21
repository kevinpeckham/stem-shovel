import { PLAN_LIMITS } from "$lib/constants/plans";
import type { AccountPlan } from "$lib/val/AccountPlanSchema";

export interface AccountLimits {
	/** Bytes of stored files the account may hold; null = unlimited. */
	storageBytes: number | null;
	/** Members (any role) the account may have; null = unlimited. */
	members: number | null;
}

/**
 * What an account may hold: the plan's limits (docs/billing.md), an admin's
 * storage override on the row when there is one, and nothing at all for a
 * founder account (never charged, unlimited data, every feature).
 */
export function accountLimits(a: {
	plan: AccountPlan;
	isFounder: boolean;
	storageLimitBytes: number | null;
}): AccountLimits {
	if (a.isFounder) return { storageBytes: null, members: null };
	const plan = PLAN_LIMITS[a.plan];
	return { storageBytes: a.storageLimitBytes ?? plan.storageBytes, members: plan.members };
}

/** Whether `incoming` more bytes fit under the limit (null limit always fits). */
export function storageFits(used: number, incoming: number, limit: number | null): boolean {
	return limit === null || used + incoming <= limit;
}
