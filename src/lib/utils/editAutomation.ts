import {
	AUTOMATION_MERGE_SECONDS,
	MAX_AUTOMATION_POINTS,
} from "#lib/constants/studioAutomation.js";
import type { AutomationPoint } from "./automationValueAt";

/** One edit of a lane (the lane component's gestures, docs/dawn-daw-plan.md D1). */
export type AutomationEdit =
	| { kind: "add"; t: number; v: number }
	| { kind: "move"; index: number; t: number; v: number }
	| { kind: "remove"; index: number }
	| { kind: "clear" };

const round4 = (x: number) => Math.round(x * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A lane after an edit, sorted by time and clamped to the parameter's
 * range: a point added within `AUTOMATION_MERGE_SECONDS` of another
 * replaces it (a click on a point moves it rather than doubling it); a
 * moved point keeps its place in the order only by its new time; the
 * lane never grows past `MAX_AUTOMATION_POINTS`. The index returned is
 * where the edited point landed (null after a remove or a clear), so a
 * selection can follow it.
 */
export function editAutomation(
	points: readonly AutomationPoint[],
	edit: AutomationEdit,
	range: { min: number; max: number },
): { points: AutomationPoint[]; index: number | null } {
	const fix = (p: AutomationPoint): AutomationPoint => ({
		t: round4(Math.max(0, p.t)),
		v: round4(clamp(p.v, range.min, range.max)),
	});
	if (edit.kind === "clear") return { points: [], index: null };
	if (edit.kind === "remove")
		return { points: points.filter((_, i) => i !== edit.index), index: null };
	const moved = fix({ t: edit.t, v: edit.v });
	const rest =
		edit.kind === "move"
			? points.filter((_, i) => i !== edit.index)
			: points.filter((p) => Math.abs(p.t - moved.t) > AUTOMATION_MERGE_SECONDS);
	if (edit.kind === "add" && rest.length >= MAX_AUTOMATION_POINTS)
		return { points: [...points], index: null };
	const next = [...rest, moved].sort((a, b) => a.t - b.t);
	return { points: next, index: next.indexOf(moved) };
}
