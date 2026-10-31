import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import ChartHtml from "./ChartHtml.svelte";

const CHART = '<barmark-chart><template shadowrootmode="open"><p>D</p></template></barmark-chart>';

afterEach(() => {
	Reflect.deleteProperty(HTMLElement.prototype, "setHTMLUnsafe");
});

describe("ChartHtml", () => {
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

	test("without setHTMLUnsafe (an older browser) the HTML still renders", async () => {
		const { container } = render(ChartHtml, { html: CHART });
		await tick();
		expect(container.querySelector("barmark-chart")).not.toBeNull();
	});
});
