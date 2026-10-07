/**
 * jsdom has no popover API. This stand-in gives it the parts a native
 * popover's component relies on: show/hide/toggle with `beforetoggle` and
 * `toggle` events (with `oldState`/`newState`), the invoker button's click
 * through `popovertarget`, light dismiss on an outside pointerdown, Escape,
 * and display:none while closed (as the UA sheet does), so Testing Library's
 * role queries skip a closed menu. Call once from `beforeAll`.
 */
const openPopovers = new Set<HTMLElement>();

function toggleEvent(type: string, oldState: string, newState: string) {
	return Object.assign(new Event(type, { cancelable: type === "beforetoggle" }), {
		oldState,
		newState,
	});
}
function show(el: HTMLElement) {
	if (openPopovers.has(el)) return;
	el.dispatchEvent(toggleEvent("beforetoggle", "closed", "open"));
	openPopovers.add(el);
	el.style.display = "block";
	el.dispatchEvent(toggleEvent("toggle", "closed", "open"));
}
function hide(el: HTMLElement) {
	if (!openPopovers.has(el)) return;
	el.dispatchEvent(toggleEvent("beforetoggle", "open", "closed"));
	openPopovers.delete(el);
	el.style.display = "none";
	el.dispatchEvent(toggleEvent("toggle", "open", "closed"));
}
const invokerOf = (el: HTMLElement) => document.querySelector(`[popovertarget="${el.id}"]`);

export function installFakePopover(): void {
	if ("showPopover" in HTMLElement.prototype) return;
	Object.assign(HTMLElement.prototype, {
		showPopover(this: HTMLElement) {
			show(this);
		},
		hidePopover(this: HTMLElement) {
			hide(this);
		},
		togglePopover(this: HTMLElement) {
			(openPopovers.has(this) ? hide : show)(this);
			return openPopovers.has(this);
		},
	});
	// A popover starts closed (the UA sheet's display:none).
	new MutationObserver(() => {
		for (const el of document.querySelectorAll<HTMLElement>("[popover]")) {
			if (!openPopovers.has(el) && el.style.display !== "none") el.style.display = "none";
		}
	}).observe(document.body, { childList: true, subtree: true });
	document.addEventListener("click", (e) => {
		const invoker = (e.target as Element).closest?.("[popovertarget]");
		const target = invoker && document.getElementById(invoker.getAttribute("popovertarget") ?? "");
		if (target) (target as HTMLElement).togglePopover();
	});
	document.addEventListener("pointerdown", (e) => {
		for (const el of Array.from(openPopovers)) {
			const inside = el.contains(e.target as Node) || invokerOf(el)?.contains(e.target as Node);
			if (!inside) hide(el);
		}
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") for (const el of Array.from(openPopovers)) hide(el);
	});
}
