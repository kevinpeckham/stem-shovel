import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const ACCOUNT_ACTIONS = ["suspend", "reactivate", "delete", "founder", "unfounder"] as const;
export const AccountActionSchema = v.picklist(ACCOUNT_ACTIONS);

/** A system admin acting on one account from /admin ("founder"/"unfounder" need a super admin). */
export const AccountAdminSchema = v.object({ id: NanoIdSchema, action: AccountActionSchema });
