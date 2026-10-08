import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import type { StemState } from "#lib/audio/types.js";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import StemRow from "./StemRow.svelte";

// The waveform is a canvas; jsdom has no 2D context, and the attachment bails on null.
beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});

function stem(overrides: Partial<StemState> = {}): StemState {
	return {
		id: "s1",
		label: "Drums",
		gain: 1,
		muted: false,
		soloed: false,
		duration: 200,
		channels: 2,
		collapsed: false,
		decodedBytes: 0,
		peaks: [0.2, 0.8],
		decoded: true,
		...overrides,
	};
}

/** An engine with the row's controls as spies, plus the spies to assert on. */
function engineWithSpies(overrides: Record<string, unknown> = {}) {
	const spies = {
		toggleMute: vi.fn(),
		toggleSolo: vi.fn(),
		setGain: vi.fn(),
		seek: vi.fn(),
	};
	return { spies, engine: fakeEngine({ duration: 400, ...spies, ...overrides } as never) };
}

const labelOf = (row: HTMLElement) => row.querySelector("[title]") as HTMLElement;

describe("StemRow", () => {
	test("a group named by the label, with the label, mute, solo, fader and waveform", () => {
		const { engine } = engineWithSpies();
		render(StemRow, { props: { stem: stem(), engine } });
		const row = screen.getByRole("group", { name: "Drums" });
		expect(row).toHaveAttribute("data-stem-row", "s1");
		expect(labelOf(row)).toHaveTextContent("Drums");
		expect(screen.getByRole("button", { name: "Mute Drums" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("button", { name: "Solo Drums" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("slider", { name: "Drums level" })).toHaveValue("1");
		expect(screen.getByRole("slider", { name: "Drums position" })).toBeInTheDocument();
	});

	test("M and S toggle through the engine, and aria-pressed follows the stem", async () => {
		const user = userEvent.setup();
		const { engine, spies } = engineWithSpies();
		const { unmount } = render(StemRow, { props: { stem: stem(), engine } });
		await user.click(screen.getByRole("button", { name: "Mute Drums" }));
		expect(spies.toggleMute).toHaveBeenCalledWith("s1");
		await user.click(screen.getByRole("button", { name: "Solo Drums" }));
		expect(spies.toggleSolo).toHaveBeenCalledWith("s1");
		unmount();
		render(StemRow, { props: { stem: stem({ muted: true, soloed: true }), engine } });
		expect(screen.getByRole("button", { name: "Mute Drums" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "Solo Drums" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	test("the fader sets the gain to its value", async () => {
		const { engine, spies } = engineWithSpies();
		render(StemRow, { props: { stem: stem(), engine } });
		const fader = screen.getByRole("slider", { name: "Drums level" });
		expect(fader).toHaveAttribute("max", "1.25");
		await fireEvent.input(fader, { target: { value: "0.5" } });
		expect(spies.setGain).toHaveBeenCalledWith("s1", 0.5);
	});

	test("m and s on anything in the row toggle, except on the fader", async () => {
		const user = userEvent.setup();
		const { engine, spies } = engineWithSpies();
		render(StemRow, { props: { stem: stem(), engine } });
		screen.getByRole("slider", { name: "Drums position" }).focus();
		await user.keyboard("m");
		expect(spies.toggleMute).toHaveBeenCalledTimes(1);
		await user.keyboard("s");
		expect(spies.toggleSolo).toHaveBeenCalledTimes(1);
		// A key that is not M or S does nothing.
		await user.keyboard("x");
		// Typing in the fader (an input) is left to it.
		screen.getByRole("slider", { name: "Drums level" }).focus();
		await user.keyboard("ms");
		expect(spies.toggleMute).toHaveBeenCalledTimes(1);
		expect(spies.toggleSolo).toHaveBeenCalledTimes(1);
	});

	test("a click on the waveform seeks the engine to that fraction of the song", async () => {
		const { engine, spies } = engineWithSpies({ duration: 400 });
		render(StemRow, { props: { stem: stem(), engine } });
		const wave = screen.getByRole("slider", { name: "Drums position" });
		wave.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
		await fireEvent.click(wave, { clientX: 25 });
		expect(spies.seek).toHaveBeenCalledWith(100);
	});

	test("⌘-click on the waveform reports the stem and the position in seconds", async () => {
		const { engine } = engineWithSpies({ duration: 400 });
		const oncontext = vi.fn();
		const s = stem();
		render(StemRow, { props: { stem: s, engine, oncontext } });
		const wave = screen.getByRole("slider", { name: "Drums position" });
		wave.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
		await fireEvent.click(wave, { clientX: 50, clientY: 7, metaKey: true });
		expect(oncontext).toHaveBeenCalledWith(s, 200, 50, 7);
	});

	test("the row dims when muted, or when another stem is soloed; a soloed stem stays bright", () => {
		const bright = () => {
			expect(labelOf(screen.getByRole("group")).className).not.toContain("opacity-60");
			expect(document.querySelector("canvas")).toHaveClass("opacity-90");
		};
		const dim = () => {
			expect(labelOf(screen.getByRole("group"))).toHaveClass("opacity-60");
			expect(document.querySelector("canvas")).toHaveClass("opacity-20");
		};
		let r = render(StemRow, { props: { stem: stem(), engine: engineWithSpies().engine } });
		bright();
		r.unmount();
		r = render(StemRow, {
			props: { stem: stem({ muted: true }), engine: engineWithSpies().engine },
		});
		dim();
		r.unmount();
		r = render(StemRow, {
			props: { stem: stem(), engine: engineWithSpies({ anySolo: true }).engine },
		});
		dim();
		r.unmount();
		r = render(StemRow, {
			props: { stem: stem({ soloed: true }), engine: engineWithSpies({ anySolo: true }).engine },
		});
		bright();
		r.unmount();
		// Not decoded yet: the waveform is faint but the label is not.
		render(StemRow, {
			props: { stem: stem({ decoded: false }), engine: engineWithSpies().engine },
		});
		expect(labelOf(screen.getByRole("group")).className).not.toContain("opacity-60");
		expect(document.querySelector("canvas")).toHaveClass("opacity-20");
	});

	test("dragging fades the row", () => {
		render(StemRow, { props: { stem: stem(), engine: engineWithSpies().engine, dragging: true } });
		expect(screen.getByRole("group")).toHaveClass("opacity-50");
	});
});
