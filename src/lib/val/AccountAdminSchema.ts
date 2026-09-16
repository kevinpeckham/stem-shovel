import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const ACCOUNT_ACTIONS = ["suspend", "reactivate", "delete"] as const;
export const AccountActionSchema = v.picklist(ACCOUNT_ACTIONS);

/** A system admin acting on one account from /admin. */
export const AccountAdminSchema = v.object({ id: NanoIdSchema, action: AccountActionSchema });
