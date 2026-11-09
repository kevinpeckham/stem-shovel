import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";

/** The status line under the player's header and the arranging-stage notice. KeepOnDevice is a stand-in. */
vi.mock("#lib/components/KeepOnDevice.svelte", () => ({ default: () => {} }));

const { default: SongPlayerStatus } = await import("./SongPlayerStatus.svelte");

const KEEP = { available: false, kept: null, keeping: null, onkeep() {}, onremove() {} };

function setup(
	engine: Partial<StemEngine> | null,
	{ showStageNotice = false, stemCount = 3 } = {},
) {
	const onmode = vi.fn();
	const onshowmixes = vi.fn();
	const { container } = render(SongPlayerStatus, {
		engine: engine as StemEngine | null,
		stemCount,
		keepProps: KEEP,
		onmode,
		showStageNotice,
		onshowmixes,
	});
	return { onmode, onshowmixes, container };
}

describe("SongPlayerStatus", () => {
	test("idle, before the load starts: loading the stems", () => {
		setup({ status: "idle", loaded: 0, total: 3 });
		expect(screen.getByText(/Loading the stems…/)).toBeInTheDocument();
	});

	test("decoding: which stem of how many", () => {
		setup({ status: "loading", loaded: 1, total: 3 });
		expect(screen.getByText(/Decoding stem 2 of 3…/)).toBeInTheDocument();
	});

	test("streamed: play buffered switches the mode", async () => {
		const { onmode } = setup({ status: "ready", mode: "streamed", buffering: false });
		expect(screen.getByText(/3\s+stems,\s+streamed/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "play buffered" }));
		expect(onmode).toHaveBeenCalledWith("buffered");
	});

	test("buffered: the decoded size", () => {
		setup({ status: "ready", mode: "buffered", decodedBytes: 2048 }, { stemCount: 1 });
		expect(screen.getByText(/1\s+stem,\s+2(\.0)? KB decoded/)).toBeInTheDocument();
	});

	test("no engine yet: no status line", () => {
		const { container } = setup(null);
		expect(container.querySelector("[aria-live]")).toBeNull();
	});

	test("the stage notice's Mixes link shows the mixes", async () => {
		const { onshowmixes } = setup(null, { showStageNotice: true });
		expect(screen.getByText(/These stems are from the arranging stage/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Mixes" }));
		expect(onshowmixes).toHaveBeenCalledTimes(1);
	});
});
