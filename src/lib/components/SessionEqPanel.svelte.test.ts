import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/audio/playbackEq.js";
import SessionEqPanel from "./SessionEqPanel.svelte";

beforeAll(installFakePopover);

function open() {
	(document.getElementById("eq") as HTMLElement).showPopover();
}

describe("SessionEqPanel", () => {
	test("labels the high-pass and the three bands, showing each gain in dB", () => {
		render(SessionEqPanel, {
			props: { id: "eq", settings: { highPass: true, low: 3.5, mid: 0, high: -6 }, onchange() {} },
		});
		open();
		expect(screen.getByRole("checkbox", { name: /High-pass \(80 Hz\)/ })).toBeChecked();
		expect(screen.getByRole("slider", { name: /Low/ })).toHaveAttribute(
			"aria-valuetext",
			"+3.5 dB",
		);
		expect(screen.getByTestId("eq-low-value")).toHaveTextContent("+3.5 dB");
		expect(screen.getByTestId("eq-mid-value")).toHaveTextContent("0 dB");
		expect(screen.getByTestId("eq-high-value")).toHaveTextContent("−6 dB");
	});

	test("a slider and the checkbox hand back new settings", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(SessionEqPanel, { props: { id: "eq", settings: { ...DEFAULT_PLAYBACK_EQ }, onchange } });
		open();
		await fireEvent.input(screen.getByRole("slider", { name: /Mid/ }), { target: { value: "-6" } });
		expect(onchange).toHaveBeenLastCalledWith({ highPass: false, low: 0, mid: -6, high: 0 });
		await user.click(screen.getByRole("checkbox", { name: /High-pass/ }));
		expect(onchange).toHaveBeenLastCalledWith({ highPass: true, low: 0, mid: 0, high: 0 });
	});

	test("Reset is off while flat and restores the defaults otherwise", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		const { rerender } = render(SessionEqPanel, {
			props: { id: "eq", settings: { ...DEFAULT_PLAYBACK_EQ }, onchange },
		});
		open();
		expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
		await rerender({ id: "eq", settings: { highPass: true, low: 2, mid: 0, high: 0 }, onchange });
		await user.click(screen.getByRole("button", { name: "Reset" }));
		expect(onchange).toHaveBeenLastCalledWith(DEFAULT_PLAYBACK_EQ);
	});
});
