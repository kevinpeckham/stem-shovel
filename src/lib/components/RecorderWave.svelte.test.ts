import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import RecorderWave from "./RecorderWave.svelte";

/** The take's waveform: a click seeks; with `onrange`, a drag selects a stretch instead (docs/demo-recording.md, "Looping a part"). */
function mount(props: Record<string, unknown>) {
	const utils = render(RecorderWave, {
		props: {
			peaks: Float32Array.from([0.2, 0.8, 0.4, 0.6]),
			history: [],
			recording: false,
			progress: 0,
			...props,
		},
	});
	const slider = screen.getByRole("slider", { name: "Take position" });
	slider.getBoundingClientRect = () =>
		({
			left: 0,
			width: 200,
			top: 0,
			height: 40,
			right: 200,
			bottom: 40,
			x: 0,
			y: 0,
			toJSON() {},
		}) as DOMRect;
	slider.setPointerCapture = vi.fn();
	return { ...utils, slider };
}

describe("RecorderWave", () => {
	test("a drag across the take selects a stretch, in order, and the band shows it", async () => {
		const onrange = vi.fn();
		const onseek = vi.fn();
		const { slider, rerender } = mount({ onrange, onseek });
		await fireEvent.pointerDown(slider, { clientX: 60, pointerId: 1, button: 0 });
		await fireEvent.pointerMove(slider, { clientX: 20, pointerId: 1 });
		await fireEvent.pointerUp(slider, { clientX: 20, pointerId: 1 });
		expect(onrange).toHaveBeenLastCalledWith(0.1, 0.3);
		expect(onseek).not.toHaveBeenCalled();
		await rerender({
			peaks: Float32Array.from([0.2, 0.8]),
			history: [],
			recording: false,
			progress: 0,
			onrange,
			onseek,
			range: { from: 0.1, to: 0.3 },
		});
		const band = slider.querySelector("[data-range]") as HTMLElement;
		expect(band.style.left).toBe("10%");
		expect(band.style.width).toBe("20%");
	});
	test("a press that stays put is a click: it seeks and selects nothing", async () => {
		const onrange = vi.fn();
		const onseek = vi.fn();
		const { slider } = mount({ onrange, onseek });
		await fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, button: 0 });
		await fireEvent.pointerMove(slider, { clientX: 102, pointerId: 1 });
		await fireEvent.pointerUp(slider, { clientX: 102, pointerId: 1 });
		expect(onrange).not.toHaveBeenCalled();
		expect(onseek).toHaveBeenCalledWith(0.5);
	});
	test("without onrange a drag scrubs, as before", async () => {
		const onseek = vi.fn();
		const { slider } = mount({ onseek });
		await fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1, button: 0 });
		await fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 });
		expect(onseek).toHaveBeenNthCalledWith(1, 0.2);
		expect(onseek).toHaveBeenNthCalledWith(2, 0.4);
	});
});
