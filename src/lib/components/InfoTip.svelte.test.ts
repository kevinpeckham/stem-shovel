import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import InfoTip from "./InfoTip.svelte";

// jsdom has no popover API: the test covers the wiring, a browser the opening.
describe("InfoTip", () => {
	test("a named button targets a popover holding the text", () => {
		render(InfoTip, { text: "Takes are numbered within the idea.", label: "About takes" });
		const button = screen.getByRole("button", { name: "About takes" });
		const target = button.getAttribute("popovertarget");
		expect(target).toMatch(/^info-tip-/);
		const tip = document.getElementById(target ?? "");
		expect(tip).not.toBeNull();
		expect(tip).toHaveAttribute("popover", "auto");
		expect(tip).toHaveTextContent("Takes are numbered within the idea.");
	});
});
