import * as v from "valibot";
import { ACTIVITY_KINDS, type ActivityKind } from "#lib/constants/dashboardActivity.js";

/** An activity event's id, `${kind}:${rowId}` (src/lib/constants/dashboardActivity.ts). */
const ACTIVITY_ID = new RegExp(`^(?:${ACTIVITY_KINDS.join("|")}):[\\w-]{1,64}$`);

/** An activity item a super admin removes from an account they act in: its event id, read as the kind and the row's id. */
export const ActivityItemSchema = v.pipe(
	v.object({ id: v.pipe(v.string(), v.regex(ACTIVITY_ID, "Not an activity item")) }),
	v.transform(({ id }) => {
		const at = id.indexOf(":");
		return { kind: id.slice(0, at) as ActivityKind, rowId: id.slice(at + 1) };
	}),
);
