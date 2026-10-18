import { STUDIO_AUTOMATION } from "#lib/constants/studioAutomation.js";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import AutomationLane from "./AutomationLane.svelte";

/**
 * The lane over a fixed geometry (100 px a second, 100 px tall, so a
 * value is easy to read off a y): a click adds a point where it lands, a
 * drag moves one, a double-click removes, the keys nudge, and every
 * gesture hands the caller the whole lane.
 */
beforeAll(() => {
	if (!("setPointerCapture" in Element.prototype))
		Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} });
	Element.prototype.getBoundingClientRect = () =>
		({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100 }) as DOMRect;
});

const base = {
	range: STUDIO_AUTOMATION.reverb,
	pxPerSecond: 100,
	width: 400,
	height: 100,
	fallback: 0.2,
	label: "Reverb",
};

describe("AutomationLane", () => {
	test("an empty lane draws the static value and a click adds a point there", async () => {
		const onchange = vi.fn();
		render(AutomationLane, { props: { ...base, points: [], onchange } });
		const lane = document.querySelector("[data-automation-lane]")!;
		// 150 px is 1.5 s; the middle of the lane (y 50 of 100 with 5 px padding) is 0.5.
		await fireEvent.pointerDown(lane, { button: 0, clientX: 150, clientY: 50 });
		expect(onchange).toHaveBeenCalledTimes(1);
		const [points] = onchange.mock.calls[0]!;
		expect(points).toHaveLength(1);
		expect(points[0].t).toBeCloseTo(1.5, 6);
		expect(points[0].v).toBeCloseTo(0.5, 2);
	});

	test("the click snaps its time unless Shift is held", async () => {
		const onchange = vi.fn();
		render(AutomationLane, {
			props: { ...base, points: [], onchange, snap: (s) => Math.round(s) },
		});
		const lane = document.querySelector("[data-automation-lane]")!;
		await fireEvent.pointerDown(lane, { button: 0, clientX: 160, clientY: 50 });
		expect(onchange.mock.calls[0]![0][0].t).toBe(2);
		await fireEvent.pointerDown(lane, { button: 0, clientX: 160, clientY: 50, shiftKey: true });
		expect(onchange.mock.calls[1]![0].some((p: { t: number }) => p.t === 1.6)).toBe(true);
	});

	test("a point drags to a new time and value, and a double-click removes it", async () => {
		const onchange = vi.fn();
		const points = [
			{ t: 1, v: 0.2 },
			{ t: 3, v: 0.8 },
		];
		render(AutomationLane, { props: { ...base, points, onchange } });
		const handle = screen.getByRole("button", { name: /Reverb point 1/ });
		await fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 77 });
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200, clientY: 50 });
		await fireEvent.pointerUp(handle, { pointerId: 1, clientX: 200, clientY: 50 });
		expect(onchange).toHaveBeenCalledTimes(1);
		const moved = onchange.mock.calls[0]![0];
		expect(moved.map((p: { t: number }) => p.t)).toEqual([2, 3]);
		expect(moved[0].v).toBeCloseTo(0.5, 2);
		await fireEvent.dblClick(screen.getByRole("button", { name: /Reverb point 2/ }));
		expect(onchange.mock.calls[1]![0]).toEqual([{ t: 1, v: 0.2 }]);
	});

	test("the arrow keys nudge a focused point and Delete removes it", async () => {
		const onchange = vi.fn();
		render(AutomationLane, { props: { ...base, points: [{ t: 1, v: 0.5 }], onchange } });
		const handle = screen.getByRole("button", { name: /Reverb point 1/ });
		await fireEvent.keyDown(handle, { key: "ArrowUp" });
		expect(onchange.mock.calls[0]![0][0].v).toBeCloseTo(0.52, 6);
		await fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
		expect(onchange.mock.calls[1]![0][0].t).toBe(2);
		await fireEvent.keyDown(handle, { key: "Delete" });
		expect(onchange.mock.calls[2]![0]).toEqual([]);
	});

	test("shows the value at the playhead", () => {
		render(AutomationLane, {
			props: {
				...base,
				points: [
					{ t: 0, v: 0 },
					{ t: 2, v: 1 },
				],
				onchange: vi.fn(),
				playhead: 1,
			},
		});
		expect(document.querySelector("[data-automation-lane]")!.textContent).toContain("Reverb · 50%");
	});
});
