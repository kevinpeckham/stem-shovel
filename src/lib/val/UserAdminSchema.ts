import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const USER_ACTIONS = ["suspend", "reactivate", "delete"] as const;
export const UserActionSchema = v.picklist(USER_ACTIONS);
export type UserAction = v.InferOutput<typeof UserActionSchema>;

/** A system admin acting on one user from /admin. */
export const UserAdminSchema = v.object({ id: NanoIdSchema, action: UserActionSchema });
