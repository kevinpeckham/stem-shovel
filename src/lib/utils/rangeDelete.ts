import { clipPart } from "./clipPart";
import type { ClipSpan } from "./trimmedClip";

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * A range of time cut out of every track (docs/dawn-daw-plan.md, D4, range
 * edits): every clip's part inside [from, to) goes. A clip wholly inside
 * goes; one straddling `from` ends there; one straddling `to` keeps what
 * comes after (utils/clipPart.ts moves its offset); one spanning the range
 * becomes two, the right piece under `newId()` (called only then), placed
 * after the left in the list. Pieces under a millisecond are dropped. With
 * `ripple`, everything at or after `to` moves earlier by the range's
 * length, closing the gap; without, the gap stays. Pure.
 */
export function rangeDelete<
	C extends ClipSpan & { id: string; trackId: string; loop?: { start: number; end: number } },
>(clips: C[], from: number, to: number, ripple: boolean, newId: () => string): C[] {
	if (to - from < 0.001) return clips;
	const shift = ripple ? to - from : 0;
	const out: C[] = [];
	for (const c of clips) {
		const end = c.start + c.duration;
		if (end <= from || c.start >= to) {
			out.push(shift && c.start >= to - 1e-6 ? { ...c, start: round4(c.start - shift) } : c);
			continue;
		}
		const left = clipPart(c, c.start, from);
		const right = clipPart(c, to, end);
		if (left) out.push(left);
		if (right) {
			const id = left ? newId() : c.id;
			out.push({ ...right, id, start: round4(right.start - shift) });
		}
	}
	return out;
}
