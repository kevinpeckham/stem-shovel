import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import { barGrid } from "$lib/audio/measures";
import { readout } from "$lib/audio/readout.svelte";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import Transport from "./Transport.svelte";

const grid = barGrid(
	[
		{ kind: "tempo", start: 0, value: "120" },
		{ kind: "meter", start: 0, value: "4/4" },
	],
	0,
);

describe("Transport", () => {
	// The readout choice is module state shared by every test; start each one on automatic.
	beforeEach(() => {
		readout.mode = null;
		localStorage.clear();
	});
	test("Play is disabled until every stem has decoded", () => {
		render(Transport, { props: { engine: fakeEngine({ status: "loading" }) } });
		expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
	});
	test("the readout shows the position as timecode by default", () => {
		render(Transport, { props: { engine: fakeEngine({ position: 88.25 }), fps: 25 } });
		expect(screen.getByRole("button", { name: /Readout format/ })).toHaveTextContent("01:28:06.20");
	});
	test("with a tempo and meter the readout defaults to bars; a click toggles to timecode and back", async () => {
		const user = userEvent.setup();
		render(Transport, { props: { engine: fakeEngine({ position: 88.25 }), grid, fps: 25 } });
		const button = screen.getByRole("button", { name: /Readout format/ });
		expect(button).toHaveTextContent("45 | 1");
		await user.click(button);
		expect(button).toHaveTextContent("01:28:06.20");
		await user.click(button);
		expect(button).toHaveTextContent("45 | 1");
	});
	test("without a grid the readout stays on timecode", async () => {
		const user = userEvent.setup();
		render(Transport, { props: { engine: fakeEngine({ position: 10 }), fps: 25 } });
		const readout = screen.getByRole("button", { name: /Readout format/ });
		expect(readout).toHaveTextContent("00:10:00.00");
		await user.click(readout);
		expect(readout).toHaveTextContent("00:10:00.00");
	});
	test("Go to beginning seeks to 0 and Play toggles", async () => {
		const user = userEvent.setup();
		const seek = vi.fn();
		const toggle = vi.fn();
		render(Transport, { props: { engine: fakeEngine({ seek, toggle }) } });
		await user.click(screen.getByRole("button", { name: "Go to beginning" }));
		expect(seek).toHaveBeenCalledWith(0);
		await user.click(screen.getByRole("button", { name: "Play" }));
		expect(toggle).toHaveBeenCalled();
	});
});
