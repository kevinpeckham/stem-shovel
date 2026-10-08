import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import Slider from "./Slider.svelte";

/**
 * The slider as a slider: its value and text for assistive technology, the
 * keys, the wheel, a press on the track (the track is told its box, since
 * jsdom has none), a drag, Shift's fine drag, a double-click's reset, the
 * fill and thumb geometry, and when the value's popover shows.
 */
beforeAll(() => {
	if (!("setPointerCapture" in Element.prototype))
		Object.assign(Element.prototype, {
			setPointerCapture() {},
			releasePointerCapture() {},
		});
});
afterEach(() => vi.useRealTimers());

const db = (v: number) => (v <= 0.001 ? "−∞ dB" : `${Math.round(20 * Math.log10(v))} dB`);
function bound(over: Record<string, unknown> = {}) {
	let value = 1;
	const oninput = vi.fn((v: number) => (value = v));
	const onchange = vi.fn();
	return {
		props: {
			label: "Guitar level",
			min: 0,
			max: 1.25,
			step: 0.01,
			resetTo: 1,
			format: db,
			get value() {
				return value;
			},
			set value(v: number) {
				value = v;
			},
			oninput,
			onchange,
			...over,
		},
		oninput,
		onchange,
		read: () => value,
	};
}
/** The track element told it spans 200 px from x=100 (or, vertical, 200 px tall from y=50). */
function box(el: HTMLElement, vertical = false) {
	el.getBoundingClientRect = () =>
		(vertical
			? { left: 0, top: 50, width: 12, height: 200, right: 12, bottom: 250 }
			: { left: 100, top: 0, width: 200, height: 12, right: 300, bottom: 12 }) as DOMRect;
}
const thumb = () => document.querySelector("[data-slider-thumb]") as HTMLElement;
const popover = () => document.querySelector("[data-slider-value]");

describe("Slider", () => {
	test("is a slider with its range, value and text; the fill and thumb sit at the value's share", () => {
		render(Slider, { props: bound().props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		expect(slider).toHaveAttribute("aria-valuemin", "0");
		expect(slider).toHaveAttribute("aria-valuemax", "1.25");
		expect(slider).toHaveAttribute("aria-valuenow", "1");
		expect(slider).toHaveAttribute("aria-valuetext", "0 dB");
		expect(slider).toHaveAttribute("aria-orientation", "horizontal");
		expect(thumb()).toHaveStyle({ left: "80%" });
		expect(popover()).toBeNull();
	});
	test("a bipolar slider fills from the centre", () => {
		render(Slider, {
			props: bound({ min: -1, max: 1, value: -0.5, bipolar: true, label: "Pan" }).props,
		});
		const fill = document.querySelector("[data-slider] .bg-blue-300") as HTMLElement;
		expect(fill).toHaveStyle({ left: "25%", right: "50%" });
	});
	test("the keys step it (Shift by ten), Home and End reach the ends; the wheel steps; a double-click resets", async () => {
		const b = bound();
		render(Slider, { props: b.props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		await fireEvent.keyDown(slider, { key: "ArrowUp" });
		expect(b.oninput).toHaveBeenLastCalledWith(1.01);
		expect(b.onchange).toHaveBeenLastCalledWith(1.01);
		await fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
		expect(b.oninput).toHaveBeenLastCalledWith(0.91);
		await fireEvent.keyDown(slider, { key: "End" });
		expect(b.oninput).toHaveBeenLastCalledWith(1.25);
		await fireEvent.keyDown(slider, { key: "Home" });
		expect(b.oninput).toHaveBeenLastCalledWith(0);
		await fireEvent.wheel(slider, { deltaY: -1 });
		expect(b.oninput).toHaveBeenLastCalledWith(0.01);
		await fireEvent.dblClick(slider);
		expect(b.read()).toBe(1);
		expect(b.onchange).toHaveBeenLastCalledWith(1);
	});
	test("a press on the track jumps there and a drag follows the pointer; Shift drags at a quarter from where the press landed", async () => {
		const b = bound();
		render(Slider, { props: b.props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		box(slider);
		// 100..300 px for 0..1.25: x=140 is a fifth along, 0.25.
		await fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 140, clientY: 6 });
		expect(b.oninput).toHaveBeenLastCalledWith(0.25);
		await fireEvent.pointerMove(slider, { pointerId: 1, clientX: 300, clientY: 6 });
		expect(b.oninput).toHaveBeenLastCalledWith(1.25);
		await fireEvent.pointerMove(slider, { pointerId: 1, clientX: 50, clientY: 6 });
		expect(b.oninput).toHaveBeenLastCalledWith(0);
		expect(b.onchange).not.toHaveBeenCalled();
		await fireEvent.pointerUp(slider, { pointerId: 1, clientX: 50, clientY: 6 });
		expect(b.onchange).toHaveBeenCalledTimes(1);
		expect(b.onchange).toHaveBeenLastCalledWith(0);
		// Shift: 80 px of the 200 is 0.5 of the range at full speed, 0.125 at a quarter.
		await fireEvent.pointerDown(slider, { button: 0, pointerId: 2, clientX: 200, clientY: 6 });
		expect(b.oninput).toHaveBeenLastCalledWith(0.63);
		await fireEvent.pointerMove(slider, { pointerId: 2, clientX: 280, clientY: 6, shiftKey: true });
		expect(b.oninput).toHaveBeenLastCalledWith(0.76);
	});
	test("vertical: the top is the maximum", async () => {
		const b = bound({ orientation: "vertical" });
		render(Slider, { props: b.props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		expect(slider).toHaveAttribute("aria-orientation", "vertical");
		box(slider, true);
		await fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 6, clientY: 50 });
		expect(b.oninput).toHaveBeenLastCalledWith(1.25);
		await fireEvent.pointerMove(slider, { pointerId: 1, clientX: 6, clientY: 200 });
		expect(b.oninput).toHaveBeenLastCalledWith(0.31);
		expect(thumb()).toHaveStyle({ bottom: "24.8%" });
	});
	test("the value's popover follows the thumb while adjusting and goes a moment later", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		render(Slider, { props: bound().props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		await fireEvent.keyDown(slider, { key: "ArrowUp" });
		expect(popover()).toHaveTextContent("0 dB");
		expect(popover()).toHaveStyle({ left: "80.8%" });
		vi.advanceTimersByTime(800);
		await tick();
		expect(popover()).toBeNull();
		await fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
		vi.advanceTimersByTime(2000);
		await tick();
		expect(popover()).not.toBeNull();
		await fireEvent.pointerUp(slider, { pointerId: 1, clientX: 0, clientY: 0 });
		vi.advanceTimersByTime(800);
		await tick();
		expect(popover()).toBeNull();
	});
	test("disabled: no focus, no changes", async () => {
		const b = bound({ disabled: true });
		render(Slider, { props: b.props });
		const slider = screen.getByRole("slider", { name: "Guitar level" });
		expect(slider).toHaveAttribute("tabindex", "-1");
		await fireEvent.keyDown(slider, { key: "ArrowUp" });
		await fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
		await fireEvent.dblClick(slider);
		expect(b.oninput).not.toHaveBeenCalled();
	});
});
