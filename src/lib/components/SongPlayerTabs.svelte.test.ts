import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { SongPlayerLayout } from "#lib/state/songPlayerLayout.svelte.js";
import SongPlayerTabs from "./SongPlayerTabs.svelte";

/** The player panel's header: the three views with their counts, the shown one selected, and the pop-out / dock button. */
function setup() {
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
	const layout = new SongPlayerLayout({
		stage: () => "arranging",
		stemCount: () => 4,
		demoCount: () => 2,
		mixCount: () => 0,
		engine: () => null,
		demoPanel: () => null,
	});
	render(SongPlayerTabs, { layout, stemCount: 4, demoCount: 2, mixCount: 0 });
	return layout;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongPlayerTabs", () => {
	test("the views with their counts; the stage's view selected", () => {
		setup();
		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual(["Stems (4)", "Demos (2)", "Mixes (0)"]);
		expect(screen.getByRole("tab", { name: "Stems (4)" })).toHaveAttribute("aria-selected", "true");
	});

	test("a tab shows its view", async () => {
		const layout = setup();
		await fireEvent.click(screen.getByRole("tab", { name: "Demos (2)" }));
		expect(layout.view).toBe("demos");
		expect(screen.getByRole("tab", { name: "Demos (2)" })).toHaveAttribute("aria-selected", "true");
	});

	test("pop out, then dock", async () => {
		const layout = setup();
		await fireEvent.click(screen.getByLabelText("Pop out the player"));
		expect(layout.mode).toBe("floating");
		flushSync();
		await fireEvent.click(screen.getByLabelText("Dock the player"));
		expect(layout.mode).toBe("docked");
	});
});
