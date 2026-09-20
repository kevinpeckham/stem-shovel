import type { CreditRole } from "$lib/val/CreditRoleSchema";

/** What each credit role is called in the interface, one and many. */
export const CREDIT_ROLE_LABELS: Record<CreditRole, { one: string; many: string; verb: string }> = {
	performer: { one: "Artist", many: "Artists", verb: "Performed by" },
	composer: { one: "Composer", many: "Composers", verb: "Written by" },
	producer: { one: "Producer", many: "Producers", verb: "Produced by" },
};
