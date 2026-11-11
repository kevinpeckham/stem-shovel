import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

// The element module is browser-only (and defines a custom element); the
// component only needs it to load, then sets the element's `text` property.
vi.mock("@barmark/render/element", () => ({}));
const { default: ChartPreview } = await import("./ChartPreview.svelte");

type ChartElement = HTMLElement & { text?: string | null; numerals?: string | null };
const chartOf = (container: HTMLElement) =>
	container.querySelector("barmark-chart") as ChartElement | null;

/** Lets the dynamic import resolve and the effect run. */
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

describe("ChartPreview", () => {
	test("draws a <barmark-chart> with the saved chart's options inside the barmark-look wrapper", async () => {
		const { container } = render(ChartPreview, { text: "## Verse\n| D |", label: "Preview" });
		const chart = chartOf(container);
		expect(chart?.getAttribute("theme")).toBe("dark");
		expect(chart?.hasAttribute("rehearsal-letters")).toBe(true);
		const wrapper = chart?.parentElement;
		expect(wrapper?.classList.contains("barmark-look")).toBe(true);
		expect(screen.getByRole("region", { name: "Preview" })).toBe(wrapper);
	});

	test("columns row draws each row's bars on their own, as the saved chart does; no attribute otherwise", async () => {
		const { container, rerender } = render(ChartPreview, { text: "| D |", columns: "row" });
		expect(chartOf(container)?.getAttribute("columns")).toBe("row");
		await rerender({ columns: "shared" });
		await tick();
		expect(chartOf(container)?.hasAttribute("columns")).toBe(false);
		const plain = render(ChartPreview, { text: "| D |" });
		expect(chartOf(plain.container)?.hasAttribute("columns")).toBe(false);
	});

	test("paper sets the wrapper's --barmark-paper for the renderer's background; unset by default", async () => {
		const { container, rerender } = render(ChartPreview, { text: "| D |", paper: "transparent" });
		const wrapper = chartOf(container)?.parentElement as HTMLElement;
		expect(wrapper.style.getPropertyValue("--barmark-paper")).toBe("transparent");
		await rerender({ paper: null });
		await tick();
		expect(wrapper.style.getPropertyValue("--barmark-paper")).toBe("");
	});

	test("hands the text to the element once it has loaded, and again on every change", async () => {
		const { container, rerender } = render(ChartPreview, { text: "| D |" });
		await settle();
		expect(chartOf(container)?.text).toBe("| D |");
		await rerender({ text: "| D | A |" });
		await tick();
		expect(chartOf(container)?.text).toBe("| D | A |");
	});

	test("spells the chords with the numerals asked for, and back to names with null", async () => {
		const { container, rerender } = render(ChartPreview, { text: "| D |", numerals: "nashville" });
		await settle();
		expect(chartOf(container)?.numerals).toBe("nashville");
		expect(chartOf(container)?.text).toBe("| D |");
		await rerender({ numerals: null });
		await tick();
		expect(chartOf(container)?.numerals).toBeNull();
	});

	test("a long chart draws at once, then waits for typing to pause", async () => {
		const long = "| D |\n".repeat(2_000); // 12,000 characters
		const { container, rerender } = render(ChartPreview, { text: long });
		await settle();
		expect(chartOf(container)?.text).toBe(long);
		await rerender({ text: `${long}| A |` });
		await tick();
		expect(chartOf(container)?.text).toBe(long);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(chartOf(container)?.text).toBe(`${long}| A |`);
	});

	test("past 50,000 characters it says so instead of drawing", async () => {
		const { container } = render(ChartPreview, { text: "x".repeat(50_001) });
		await settle();
		expect(chartOf(container)).toBeNull();
		expect(screen.getByRole("status").textContent).toContain("too long to preview");
	});
});
