import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import ComboBox from "./ComboBox.svelte";

/**
 * jsdom has no popover API, and the combobox is a native popover opened by
 * its trigger's `popovertarget`. This stand-in gives jsdom the parts the
 * component relies on: show/hide/toggle with `beforetoggle` and `toggle`
 * events, the invoker button's click, light dismiss on an outside
 * pointerdown, Escape, and display:none while closed (as the UA sheet does).
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
beforeAll(() => {
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
	if (!("scrollIntoView" in Element.prototype)) {
		Object.defineProperty(Element.prototype, "scrollIntoView", { value() {}, configurable: true });
	}
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
});

const options = [
	{ value: "a", label: "Alpha", description: "2 takes" },
	{ value: "b", label: "Beta" },
	{ value: "c", label: "Gamma" },
];

describe("ComboBox", () => {
	test("shows the selection, opens a listbox and picks with the pointer", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(ComboBox, { options, value: "a", ariaLabel: "Idea", onchange });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		expect(trigger).toHaveTextContent("Alpha");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("listbox")).toBeNull();
		await user.click(trigger);
		expect(screen.getByRole("listbox", { name: "Idea" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
		await user.click(screen.getByRole("option", { name: "Beta" }));
		expect(onchange).toHaveBeenCalledWith("b");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(trigger).toHaveTextContent("Beta");
	});

	test("keyboard: arrows move, Enter picks, Escape closes", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(ComboBox, { options, value: "a", ariaLabel: "Idea", onchange });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		trigger.focus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(onchange).toHaveBeenCalledWith("c");
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	test("closes on an outside pointerdown and shows the placeholder when nothing matches", async () => {
		const user = userEvent.setup();
		render(ComboBox, { options, value: "zzz", ariaLabel: "Idea", placeholder: "Pick one" });
		const trigger = screen.getByRole("combobox", { name: "Idea" });
		expect(trigger).toHaveTextContent("Pick one");
		await user.click(trigger);
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.click(document.body);
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});
