import * as v from "valibot";

/**
 * How an artist is credited on a song: the performer (the artist line under
 * the title), a composer ("Written by") or a producer ("Produced by"). A
 * song has any number of each.
 */
export const CREDIT_ROLES = ["performer", "composer", "producer"] as const;
export const CreditRoleSchema = v.picklist(CREDIT_ROLES);
export type CreditRole = v.InferOutput<typeof CreditRoleSchema>;
