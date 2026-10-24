import { clipPart } from "./clipPart";
import type { ClipSpan } from "./trimmedClip";

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Silence inserted at `at` on every track (docs/dawn-daw-plan.md, D4,
 * range edits): a clip starting at or after `at` moves later by
 * `seconds`; one straddling `at` splits there (utils/clipPart.ts), the
 * right piece under `newId()` and moved later, placed after the left in
 * the list. A cut within a millisecond of a clip's edge moves or keeps the
 * clip whole instead. Pure.
 */
export function rangeInsert<
	C extends ClipSpan & { id: string; trackId: string; loop?: { start: number; end: number } },
>(clips: C[], at: number, seconds: number, newId: () => string): C[] {
	if (seconds < 0.001) return clips;
	const out: C[] = [];
	for (const c of clips) {
		const end = c.start + c.duration;
		if (c.start >= at - 0.001) {
			out.push({ ...c, start: round4(c.start + seconds) });
			continue;
		}
		if (end <= at + 0.001) {
			out.push(c);
			continue;
		}
		const left = clipPart(c, c.start, at);
		const right = clipPart(c, at, end);
		if (left) out.push(left);
		if (right) out.push({ ...right, id: newId(), start: round4(right.start + seconds) });
	}
	return out;
}
