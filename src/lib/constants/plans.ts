import type { AccountPlan } from "$lib/val/AccountPlanSchema";

/** The first accounts ever created are founders: never charged, unlimited data, every feature. */
export const FOUNDER_SEATS = 20;

export const PLAN_LABELS: Record<AccountPlan, string> = { free: "Free" };
