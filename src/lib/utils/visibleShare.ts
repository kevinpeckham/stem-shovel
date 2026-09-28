import type { Attachment } from "svelte/attachments";

/**
 * An attachment reporting how much of an element is on screen, 0 to 1: the
 * visible height over the height that could be visible (the element's own,
 * or the viewport's when the element is taller). An IntersectionObserver
 * over twenty thresholds keeps the figure current through a scroll without
 * a scroll listener. The home page uses it to give the space bar to the
 * demo the visitor is looking at.
 */
export function visibleShare(onchange: (share: number) => void): Attachment<HTMLElement> {
	return (element) => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting || !entry.rootBounds) return onchange(0);
				const could = Math.min(entry.boundingClientRect.height, entry.rootBounds.height);
				onchange(could > 0 ? Math.min(1, entry.intersectionRect.height / could) : 0);
			},
			{ threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
		);
		observer.observe(element);
		return () => {
			observer.disconnect();
			onchange(0);
		};
	};
}
