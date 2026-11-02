import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

// The element module is browser-only; the factory runs only if the component loads it.
const loaded = vi.hoisted(() => ({ element: false }));
vi.mock("@barmark/render/element", () => {
	loaded.element = true;
	return {};
});
const { default: ChartHtml } = await import("./ChartHtml.svelte");

type ChartElement = HTMLElement & { text?: string | null; numerals?: string | null };

/** Lets the tick, the dynamic import and the attachment's work finish. */
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

const CHART = '<barmark-chart><template shadowrootmode="open"><p>D</p></template></barmark-chart>';

afterEach(() => {
	Reflect.deleteProperty(HTMLElement.prototype, "setHTMLUnsafe");
});

describe("ChartHtml", () => {
	test("paper sets the wrapper's --barmark-paper, which the renderer reads for its background; unset by default", async () => {
		const { container, rerender } = render(ChartHtml, { html: CHART, paper: "transparent" });
		await tick();
		const wrapper = container.querySelector("barmark-chart")?.parentElement as HTMLElement;
		expect(wrapper.classList.contains("barmark-look")).toBe(true);
		expect(wrapper.style.getPropertyValue("--barmark-paper")).toBe("transparent");
		await rerender({ html: CHART, paper: null });
		await tick();
		const plain = container.querySelector("barmark-chart")?.parentElement as HTMLElement;
		expect(plain.style.getPropertyValue("--barmark-paper")).toBe("");
	});

	test("a chart inserted from script has no shadow root: it is parsed again with setHTMLUnsafe", async () => {
		const setHTMLUnsafe = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "setHTMLUnsafe", {
			value: setHTMLUnsafe,
			configurable: true,
		});
		const { container, rerender } = render(ChartHtml, { html: CHART });
		await tick();
		expect(container.querySelector("barmark-chart")).not.toBeNull();
		expect(setHTMLUnsafe).toHaveBeenCalledWith(CHART);
		const next = CHART.replace("<p>D</p>", "<p>A</p>");
		await rerender({ html: next });
		await tick();
		expect(setHTMLUnsafe).toHaveBeenLastCalledWith(next);
	});

	test("markdown HTML (a chart not yet in barmark) is shown as it is", async () => {
		const setHTMLUnsafe = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "setHTMLUnsafe", {
			value: setHTMLUnsafe,
			configurable: true,
		});
		const { container } = render(ChartHtml, { html: "<p>Key: D</p>" });
		await tick();
		expect(container.querySelector("p")?.textContent).toBe("Key: D");
		expect(setHTMLUnsafe).not.toHaveBeenCalled();
	});

	test("the wrapper wears barmark-look, the chart's palette and fonts", async () => {
		const { container } = render(ChartHtml, { html: CHART });
		await tick();
		const wrapper = container.querySelector("barmark-chart")?.parentElement;
		expect(wrapper?.classList.contains("barmark-look")).toBe(true);
		expect(wrapper?.classList.contains("min-w-0")).toBe(true);
	});

	test("without setHTMLUnsafe (an older browser) the HTML still renders", async () => {
		const { container } = render(ChartHtml, { html: CHART });
		await tick();
		expect(container.querySelector("barmark-chart")).not.toBeNull();
	});

	test("chord names (no numerals) load nothing and leave the server's chart as it is", async () => {
		const { container } = render(ChartHtml, { html: CHART, markdown: "| D |" });
		await settle();
		const chart = container.querySelector("barmark-chart") as ChartElement;
		expect(loaded.element).toBe(false);
		expect(chart.text).toBeUndefined();
		expect(chart.numerals).toBeUndefined();
	});

	test("numerals load the element and hand it the chart text to redraw; back to names keeps the text", async () => {
		const { container, rerender } = render(ChartHtml, {
			html: CHART,
			markdown: "key: D\n| D | A |",
			numerals: "roman",
		});
		await settle();
		const chart = container.querySelector("barmark-chart") as ChartElement;
		expect(loaded.element).toBe(true);
		expect(chart.numerals).toBe("roman");
		expect(chart.text).toBe("key: D\n| D | A |");
		await rerender({ numerals: null });
		await settle();
		expect(chart.numerals).toBeNull();
		expect(chart.text).toBe("key: D\n| D | A |");
	});

	test("text (a transposition) is drawn in place of the markdown; back to null draws the markdown again", async () => {
		const { container, rerender } = render(ChartHtml, {
			html: CHART,
			markdown: "key: D\n| D | A |",
			text: "key: E\n| E | B |",
		});
		await settle();
		const chart = container.querySelector("barmark-chart") as ChartElement;
		expect(loaded.element).toBe(true);
		expect(chart.numerals).toBeNull();
		expect(chart.text).toBe("key: E\n| E | B |");
		await rerender({ text: null });
		await settle();
		expect(chart.text).toBe("key: D\n| D | A |");
	});
});
