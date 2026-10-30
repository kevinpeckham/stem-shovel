import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import KeepOnDevice from "./KeepOnDevice.svelte";

/** The Stem Player's "keep on this device" line (KeepOnDevice.svelte): progress, the kept copy, or the link to keep. */
const MB = 1024 * 1024;
const props = (over: Partial<Parameters<typeof render<typeof KeepOnDevice>>[1]> = {}) => ({
	available: true,
	kept: null,
	keeping: null,
	onkeep: vi.fn(),
	onremove: vi.fn(),
	...over,
});

describe("KeepOnDevice", () => {
	test("nothing kept: a link that keeps, with the connection caveat", async () => {
		const p = props();
		render(KeepOnDevice, { props: p });
		const keep = screen.getByRole("button", { name: "keep on this device" });
		expect(keep).toHaveClass("link");
		expect(keep.title).toMatch(/The page itself still needs a connection/);
		await userEvent.click(keep);
		expect(p.onkeep).toHaveBeenCalledTimes(1);
	});
	test("nothing at all without a song or a cache", () => {
		render(KeepOnDevice, { props: props({ available: false }) });
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText(/keep/)).toBeNull();
	});
	test("while keeping: the count and no link", () => {
		render(KeepOnDevice, { props: props({ keeping: { done: 3, total: 8 } }) });
		expect(screen.getByText("keeping… 3 of 8")).toBeInTheDocument();
		expect(screen.queryByRole("button")).toBeNull();
	});
	test("kept whole: the size and a remove link", async () => {
		const p = props({ kept: { bytes: 42 * MB, missing: 0 } });
		render(KeepOnDevice, { props: p });
		expect(screen.getByText(/kept on this device \(42\.0 MB\)/)).toBeInTheDocument();
		const remove = screen.getByRole("button", { name: "remove" });
		expect(remove).toHaveAttribute("title", "Remove this song's playback files from this device");
		await userEvent.click(remove);
		expect(p.onremove).toHaveBeenCalledTimes(1);
		expect(p.onkeep).not.toHaveBeenCalled();
	});
	test("kept in part: how many stems are missing and an update link that keeps", async () => {
		const p = props({ kept: { bytes: 42 * MB, missing: 2 } });
		render(KeepOnDevice, { props: p });
		expect(
			screen.getByText(/kept on this device \(42\.0 MB, 2 stems missing\)/),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "update" }));
		expect(p.onkeep).toHaveBeenCalledTimes(1);
	});
});
