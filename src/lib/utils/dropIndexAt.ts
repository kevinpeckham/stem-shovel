/**
 * Where a dragged row belongs among rows laid out top to bottom: the index
 * of the first row whose vertical middle the pointer is above, or the last
 * index when it is below them all. Takes the rows' boxes, so the stem
 * player and the project page share it and a test needs no DOM.
 */
export function dropIndexAt(boxes: readonly { top: number; height: number }[], y: number): number {
	for (let i = 0; i < boxes.length; i++) {
		const b = boxes[i]!;
		if (y < b.top + b.height / 2) return i;
	}
	return Math.max(0, boxes.length - 1);
}
