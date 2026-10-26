import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ, type PlaybackEqSettings } from "#lib/audio/playbackEq.js";
import SessionEqPanel from "./SessionEqPanel.svelte";

beforeAll(installFakePopover);

function open() {
	(document.getElementById("eq") as HTMLElement).showPopover();
}
const flat = () => structuredClone(DEFAULT_PLAYBACK_EQ) as PlaybackEqSettings;

describe("SessionEqPanel", () => {
	test("labels the high-pass and the five bands, showing each gain in dB and each center", () => {
		const settings = flat();
		settings.highPass = true;
		settings.low.gain = 3.5;
		settings.high.gain = -6;
		settings.highMid.freq = 2500;
		render(SessionEqPanel, { props: { id: "eq", settings, onchange() {} } });
		open();
		expect(screen.getByRole("checkbox", { name: /High-pass \(80 Hz\)/ })).toBeChecked();
		for (const label of ["Low", "Low mid", "Mid", "High mid", "High"]) {
			expect(screen.getByRole("slider", { name: `${label} gain` })).toBeVisible();
			expect(screen.getByRole("slider", { name: `${label} center` })).toBeVisible();
		}
		expect(screen.getByRole("slider", { name: "Low gain" })).toHaveAttribute(
			"aria-valuetext",
			"+3.5 dB",
		);
		expect(screen.getByTestId("eq-low-value")).toHaveTextContent("+3.5 dB");
		expect(screen.getByTestId("eq-mid-value")).toHaveTextContent("0 dB");
		expect(screen.getByTestId("eq-high-value")).toHaveTextContent("−6 dB");
		expect(screen.getByTestId("eq-lowMid-freq")).toHaveTextContent("400 Hz");
		expect(screen.getByTestId("eq-mid-freq")).toHaveTextContent("1.0 kHz");
		expect(screen.getByTestId("eq-highMid-freq")).toHaveTextContent("2.5 kHz");
		expect(screen.getByRole("slider", { name: "Mid center" })).toHaveAttribute(
			"aria-valuetext",
			"1.0 kHz",
		);
	});

	test("a gain slider, a center slider and the checkbox hand back new settings", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(SessionEqPanel, { props: { id: "eq", settings: flat(), onchange } });
		open();
		await fireEvent.input(screen.getByRole("slider", { name: "Mid gain" }), {
			target: { value: "-6" },
		});
		expect(onchange).toHaveBeenLastCalledWith({ ...flat(), mid: { gain: -6, freq: 1000 } });
		// The center slider's ends are the band's range; between them a log scale on a round grid.
		const center = screen.getByRole("slider", { name: "Mid center" });
		await fireEvent.input(center, { target: { value: "200" } });
		expect(onchange).toHaveBeenLastCalledWith({ ...flat(), mid: { gain: 0, freq: 3000 } });
		await fireEvent.input(center, { target: { value: "0" } });
		expect(onchange).toHaveBeenLastCalledWith({ ...flat(), mid: { gain: 0, freq: 400 } });
		await fireEvent.input(center, { target: { value: "100" } });
		const freq = (onchange.mock.lastCall![0] as PlaybackEqSettings).mid.freq;
		expect(freq).toBeGreaterThan(1000);
		expect(freq).toBeLessThan(1200);
		expect(freq % 50).toBe(0);
		await user.click(screen.getByRole("checkbox", { name: /High-pass/ }));
		expect(onchange).toHaveBeenLastCalledWith({ ...flat(), highPass: true });
	});

	test("Reset and Download follow their props and call their handlers", async () => {
		const user = userEvent.setup();
		const onreset = vi.fn();
		const ondownload = vi.fn();
		const props = { id: "eq", settings: flat(), onchange() {}, onreset, ondownload };
		const { rerender } = render(SessionEqPanel, {
			props: { ...props, canReset: false, downloadDisabled: true },
		});
		open();
		expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Download with EQ" })).toBeDisabled();
		await rerender({ ...props, canReset: true, downloadDisabled: false });
		await user.click(screen.getByRole("button", { name: "Reset" }));
		await user.click(screen.getByRole("button", { name: "Download with EQ" }));
		expect(onreset).toHaveBeenCalledOnce();
		expect(ondownload).toHaveBeenCalledOnce();
	});

	test("Auto waits for a measured recording, then calls its handler", async () => {
		const user = userEvent.setup();
		const onauto = vi.fn();
		const props = { id: "eq", settings: flat(), onchange() {}, onauto };
		const { rerender } = render(SessionEqPanel, { props });
		open();
		const auto = screen.getByRole("button", { name: "Auto" });
		expect(auto).toBeDisabled();
		expect(auto).toHaveAttribute("title", "Not measured yet");
		await rerender({ ...props, canAuto: true });
		expect(auto).toBeEnabled();
		expect(auto).toHaveAttribute(
			"title",
			"Set the EQ from this recording's measured sound against a live-mix curve; adjust from there",
		);
		await user.click(auto);
		expect(onauto).toHaveBeenCalledOnce();
	});

	test("a member sees Save for everyone, and Remove shared EQ when there is one", async () => {
		const props = { id: "eq", settings: flat(), onchange() {} };
		const { rerender } = render(SessionEqPanel, { props });
		open();
		expect(screen.queryByRole("button", { name: "Save for everyone" })).toBeNull();
		await rerender({ ...props, canEdit: true, sharedMatches: false, hasShared: true });
		expect(screen.getByRole("button", { name: "Save for everyone" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Remove shared EQ" })).toBeVisible();
	});
});
