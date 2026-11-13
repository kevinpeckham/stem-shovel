import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import ChartViewSwitch from "./ChartViewSwitch.svelte";

/** The chart toolbar's Grid / Score toggle. */
describe("ChartViewSwitch", () => {
	test("a View radiogroup with the shown view checked", () => {
		render(ChartViewSwitch, { view: "score", onpick: vi.fn() });
		expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Score" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "false");
	});

	test("a press hands the view to onpick", async () => {
		const onpick = vi.fn();
		render(ChartViewSwitch, { view: "grid", onpick });
		await fireEvent.click(screen.getByRole("radio", { name: "Score" }));
		expect(onpick).toHaveBeenCalledWith("score");
	});
});
