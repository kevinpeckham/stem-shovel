/**
 * Places a popover beside its trigger in browsers without CSS anchor
 * positioning (Firefox, older Safari); where `position-area` works the CSS
 * does it and this is a no-op. Writes through the CSSOM (`el.style`), which
 * a CSP without 'unsafe-inline' still allows. Returns a function that stops
 * following the trigger (call it when the popover closes).
 */
export const supportsAnchor = typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");

export interface PlaceOptions {
	side?: "bottom" | "top";
	/** "stretch" also gives the popover the trigger's width (a listbox under its combobox). */
	align?: "start" | "end" | "stretch";
	gap?: number;
}

export function placePopover(
	popover: HTMLElement,
	trigger: HTMLElement,
	{ side = "bottom", align = "start", gap = 4 }: PlaceOptions = {},
): () => void {
	if (supportsAnchor) return () => {};
	const place = () => {
		const t = trigger.getBoundingClientRect();
		if (align === "stretch") popover.style.setProperty("width", `${t.width}px`);
		const p = popover.getBoundingClientRect();
		// The top layer uses position: fixed, so viewport coordinates work directly.
		const top = side === "bottom" ? t.bottom + gap : t.top - p.height - gap;
		const left = align === "end" ? t.right - p.width : t.left;
		popover.style.setProperty("position", "fixed");
		popover.style.setProperty("inset", "auto");
		popover.style.setProperty("margin", "0");
		popover.style.setProperty("top", `${Math.max(gap, top)}px`);
		popover.style.setProperty("left", `${Math.max(gap, left)}px`);
	};
	place();
	window.addEventListener("scroll", place, true);
	window.addEventListener("resize", place);
	return () => {
		window.removeEventListener("scroll", place, true);
		window.removeEventListener("resize", place);
	};
}
