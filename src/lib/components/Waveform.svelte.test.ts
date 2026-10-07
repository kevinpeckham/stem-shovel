import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import Waveform from "./Waveform.svelte";

// jsdom has no 2D context (and logs "not implemented" for every call): the
// attachment bails on a null context, so the drawing is out of scope here.
beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});

/** The slider spans 200 px from x = 100, so clientX 150 is a quarter of the way in. */
function rect(el: HTMLElement) {
	el.getBoundingClientRect = () =>
		({ left: 100, width: 200, top: 0, height: 56, right: 300, bottom: 56 }) as DOMRect;
	return el;
}

const peaks = [0.1, 0.5, 0.9, 0.2];

describe("Waveform", () => {
	test("is a slider named for the stem, with the progress as its value and the playhead", () => {
		render(Waveform, { props: { peaks, progress: 0.254, label: "Drums" } });
		const slider = screen.getByRole("slider", { name: "Drums position" });
		expect(slider).toHaveAttribute("aria-valuemin", "0");
		expect(slider).toHaveAttribute("aria-valuemax", "100");
		expect(slider).toHaveAttribute("aria-valuenow", "25");
		const playhead = slider.querySelector("div.pointer-events-none") as HTMLElement;
		expect(playhead.style.left).toBe("25.4%");
	});

	test("dimmed draws the canvas faint", () => {
		const { unmount } = render(Waveform, { props: { peaks, progress: 0, label: "Drums" } });
		expect(document.querySelector("canvas")).toHaveClass("opacity-90");
		unmount();
		render(Waveform, { props: { peaks, progress: 0, label: "Drums", dimmed: true } });
		expect(document.querySelector("canvas")).toHaveClass("opacity-20");
	});

	test("a click seeks to the fraction under the pointer, clamped to 0..1", async () => {
		const onseek = vi.fn();
		render(Waveform, { props: { peaks, progress: 0, label: "Drums", onseek } });
		const slider = rect(screen.getByRole("slider"));
		await fireEvent.click(slider, { clientX: 150 });
		expect(onseek).toHaveBeenLastCalledWith(0.25);
		await fireEvent.click(slider, { clientX: 20 });
		expect(onseek).toHaveBeenLastCalledWith(0);
		await fireEvent.click(slider, { clientX: 900 });
		expect(onseek).toHaveBeenLastCalledWith(1);
		expect(onseek).toHaveBeenCalledTimes(3);
	});

	test("⌘-click, Ctrl-click and a right click open the context at the position instead of seeking", async () => {
		const onseek = vi.fn();
		const oncontext = vi.fn();
		render(Waveform, { props: { peaks, progress: 0, label: "Drums", onseek, oncontext } });
		const slider = rect(screen.getByRole("slider"));
		await fireEvent.click(slider, { clientX: 200, clientY: 30, metaKey: true });
		expect(oncontext).toHaveBeenLastCalledWith(0.5, 200, 30);
		await fireEvent.click(slider, { clientX: 250, clientY: 10, ctrlKey: true });
		expect(oncontext).toHaveBeenLastCalledWith(0.75, 250, 10);
		const contextmenu = new MouseEvent("contextmenu", {
			clientX: 120,
			clientY: 40,
			bubbles: true,
			cancelable: true,
		});
		await fireEvent(slider, contextmenu);
		expect(oncontext).toHaveBeenLastCalledWith(0.1, 120, 40);
		expect(contextmenu.defaultPrevented).toBe(true);
		expect(onseek).not.toHaveBeenCalled();
	});

	test("without oncontext a ⌘-click seeks and a right click is left to the browser", async () => {
		const onseek = vi.fn();
		render(Waveform, { props: { peaks, progress: 0, label: "Drums", onseek } });
		const slider = rect(screen.getByRole("slider"));
		await fireEvent.click(slider, { clientX: 200, metaKey: true });
		expect(onseek).toHaveBeenCalledWith(0.5);
		const contextmenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		await fireEvent(slider, contextmenu);
		expect(contextmenu.defaultPrevented).toBe(false);
	});

	test("arrow keys nudge by 2 % (clamped), Home and End jump; other keys do nothing", async () => {
		const user = userEvent.setup();
		const onseek = vi.fn();
		const { rerender } = render(Waveform, {
			props: { peaks, progress: 0.5, label: "Drums", onseek },
		});
		const slider = screen.getByRole("slider");
		slider.focus();
		await user.keyboard("{ArrowRight}");
		expect(onseek).toHaveBeenLastCalledWith(0.52);
		await user.keyboard("{ArrowLeft}");
		expect(onseek).toHaveBeenLastCalledWith(0.48);
		await user.keyboard("{Home}");
		expect(onseek).toHaveBeenLastCalledWith(0);
		await user.keyboard("{End}");
		expect(onseek).toHaveBeenLastCalledWith(1);
		await user.keyboard("{ArrowDown}x");
		expect(onseek).toHaveBeenCalledTimes(4);
		await rerender({ progress: 0.99 });
		await user.keyboard("{ArrowRight}");
		expect(onseek).toHaveBeenLastCalledWith(1);
		await rerender({ progress: 0.01 });
		await user.keyboard("{ArrowLeft}");
		expect(onseek).toHaveBeenLastCalledWith(0);
	});
});
