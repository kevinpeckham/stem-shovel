import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import Knob from "./Knob.svelte";

/**
 * The knob as a slider: its value and text for assistive technology, the
 * keys, the wheel, a drag (pointer geometry is real enough in jsdom for
 * client coordinates), a double-click's reset, and when the value's
 * popover shows.
 */
beforeAll(() => {
	if (!("setPointerCapture" in Element.prototype))
		Object.assign(Element.prototype, {
			setPointerCapture() {},
			releasePointerCapture() {},
		});
});
afterEach(() => vi.useRealTimers());

const pan = (v: number) =>
	v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`;
function bound(over: Record<string, unknown> = {}) {
	let value = -0.5;
	const oninput = vi.fn((v: number) => (value = v));
	const onchange = vi.fn();
	return {
		props: {
			label: "Guitar pan",
			min: -1,
			max: 1,
			step: 0.05,
			resetTo: 0,
			bipolar: true,
			format: pan,
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

describe("Knob", () => {
	test("is a slider with its range, value and text, sized as asked, and no value text until adjusted", () => {
		render(Knob, { props: bound({ size: 26 }).props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		expect(knob).toHaveAttribute("aria-valuemin", "-1");
		expect(knob).toHaveAttribute("aria-valuemax", "1");
		expect(knob).toHaveAttribute("aria-valuenow", "-0.5");
		expect(knob).toHaveAttribute("aria-valuetext", "L 50");
		expect(knob).toHaveStyle({ width: "26px", height: "26px" });
		expect(document.querySelector("[data-knob-value]")).toBeNull();
	});
	test("the arrow keys step it (Shift by ten), Home and End reach the ends, and each is a change", async () => {
		const b = bound();
		render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		await fireEvent.keyDown(knob, { key: "ArrowRight" });
		expect(b.oninput).toHaveBeenLastCalledWith(-0.45);
		expect(b.onchange).toHaveBeenLastCalledWith(-0.45);
		await fireEvent.keyDown(knob, { key: "ArrowDown", shiftKey: true });
		expect(b.oninput).toHaveBeenLastCalledWith(-0.95);
		await fireEvent.keyDown(knob, { key: "Home" });
		expect(b.oninput).toHaveBeenLastCalledWith(-1);
		await fireEvent.keyDown(knob, { key: "End" });
		expect(b.oninput).toHaveBeenLastCalledWith(1);
		await fireEvent.keyDown(knob, { key: "PageDown" });
		expect(b.oninput).toHaveBeenLastCalledWith(0.5);
		expect(b.onchange).toHaveBeenCalledTimes(5);
	});
	test("the wheel steps it, up for more; a double-click returns to the reset value", async () => {
		const b = bound();
		render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		await fireEvent.wheel(knob, { deltaY: -100 });
		expect(b.read()).toBe(-0.45);
		await fireEvent.wheel(knob, { deltaY: 120, shiftKey: true });
		expect(b.read()).toBe(-0.95);
		await fireEvent.dblClick(knob);
		expect(b.read()).toBe(0);
		expect(b.onchange).toHaveBeenLastCalledWith(0);
	});
	test("a drag up raises it by its travel over the range, reports every move and one change at the end", async () => {
		const b = bound();
		render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		await fireEvent.pointerDown(knob, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
		// 50 px up of a 200 px travel: a quarter of the 2.0 range, 0.5 more.
		await fireEvent.pointerMove(knob, { pointerId: 1, clientX: 100, clientY: 50 });
		expect(b.oninput).toHaveBeenLastCalledWith(0);
		expect(b.onchange).not.toHaveBeenCalled();
		// Another 20 px right counts the same as 20 px up.
		await fireEvent.pointerMove(knob, { pointerId: 1, clientX: 120, clientY: 50 });
		expect(b.oninput).toHaveBeenLastCalledWith(0.2);
		await fireEvent.pointerUp(knob, { pointerId: 1, clientX: 120, clientY: 50 });
		expect(b.onchange).toHaveBeenCalledTimes(1);
		expect(b.onchange).toHaveBeenLastCalledWith(0.2);
		// Shift: four times finer.
		await fireEvent.pointerDown(knob, { button: 0, pointerId: 2, clientX: 0, clientY: 100 });
		await fireEvent.pointerMove(knob, { pointerId: 2, clientX: 0, clientY: 20, shiftKey: true });
		expect(b.oninput).toHaveBeenLastCalledWith(0.4);
	});
	test("the value's popover shows while adjusting and goes a moment later; 'always' keeps it; 'never' hides it", async () => {
		// Only the timers: faking the microtask queue too would stall Testing Library's own awaits.
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const b = bound();
		const { unmount } = render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		await fireEvent.keyDown(knob, { key: "ArrowRight" });
		expect(document.querySelector("[data-knob-value]")).toHaveTextContent("L 45");
		vi.advanceTimersByTime(800);
		await tick();
		expect(document.querySelector("[data-knob-value]")).toBeNull();
		// A drag holds it until the pointer lifts.
		await fireEvent.pointerDown(knob, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
		vi.advanceTimersByTime(2000);
		await tick();
		expect(document.querySelector("[data-knob-value]")).not.toBeNull();
		await fireEvent.pointerUp(knob, { pointerId: 1, clientX: 0, clientY: 0 });
		vi.advanceTimersByTime(800);
		await tick();
		expect(document.querySelector("[data-knob-value]")).toBeNull();
		unmount();
		render(Knob, { props: bound({ showValue: "always" }).props });
		expect(document.querySelector("[data-knob-value]")).toHaveTextContent("L 50");
		render(Knob, { props: bound({ showValue: "never", label: "Mute pan" }).props });
		await fireEvent.keyDown(screen.getByRole("slider", { name: "Mute pan" }), { key: "ArrowUp" });
		expect(document.querySelectorAll("[data-knob-value]")).toHaveLength(1);
	});
	test("disabled: no focus, no changes", async () => {
		const b = bound({ disabled: true });
		render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		expect(knob).toHaveAttribute("tabindex", "-1");
		expect(knob).toHaveAttribute("aria-disabled", "true");
		await fireEvent.keyDown(knob, { key: "ArrowRight" });
		await fireEvent.wheel(knob, { deltaY: -100 });
		await fireEvent.dblClick(knob);
		expect(b.oninput).not.toHaveBeenCalled();
	});
	test("snaps to the step and stays within the range", async () => {
		const b = bound({ step: 0.1 });
		render(Knob, { props: b.props });
		const knob = screen.getByRole("slider", { name: "Guitar pan" });
		await fireEvent.pointerDown(knob, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
		await fireEvent.pointerMove(knob, { pointerId: 1, clientX: 0, clientY: 7 });
		expect(b.oninput).toHaveBeenLastCalledWith(-0.6);
		await fireEvent.pointerMove(knob, { pointerId: 1, clientX: 0, clientY: 900 });
		expect(b.oninput).toHaveBeenLastCalledWith(-1);
	});
});
