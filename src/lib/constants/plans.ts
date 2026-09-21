import type { AccountPlan } from "$lib/val/AccountPlanSchema";

/** The first accounts ever created are founders: never charged, unlimited data, every feature. */
export const FOUNDER_SEATS = 20;

export const PLAN_LABELS: Record<AccountPlan, string> = { free: "Free" };

/**
 * What each plan may hold (the pricing page's promise): stored files (stems,
 * demos and takes; renditions and mixes are ours) and members of any role.
 * A founder account has no limits; an admin can raise one account's storage
 * on its row (`account.storage_limit_bytes`). src/lib/utils/accountLimits.ts.
 */
export const PLAN_LIMITS: Record<AccountPlan, { storageBytes: number; members: number }> = {
	free: { storageBytes: 10 * 1024 ** 3, members: 5 },
};
