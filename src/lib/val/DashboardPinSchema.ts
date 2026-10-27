import * as v from "valibot";

/** What a person can pin to their dashboard. */
export const DASHBOARD_PIN_KINDS = ["song", "project", "session"] as const;

export const DashboardPinKindSchema = v.picklist(DASHBOARD_PIN_KINDS);
export type DashboardPinKind = v.InferOutput<typeof DashboardPinKindSchema>;

/** A pin to set or clear: the kind and the id of the song, project or session. */
export const DashboardPinSchema = v.object({
	kind: DashboardPinKindSchema,
	id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	pinned: v.boolean(),
});
export type DashboardPinInput = v.InferOutput<typeof DashboardPinSchema>;
