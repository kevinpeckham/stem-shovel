import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import LibraryPanel from "./LibraryPanel.svelte";

const items = [
	{
		id: "s1",
		label: "Guitar take",
		durationSeconds: 12.5,
		channels: 2,
		status: "ready" as const,
		pending: false,
		uses: 2,
	},
	{
		id: "s2",
		label: "Bass",
		durationSeconds: 4,
		channels: 1,
		status: "ready" as const,
		pending: true,
		uses: 0,
	},
	{
		id: "s3",
		label: "Lost",
		durationSeconds: 1,
		channels: 1,
		status: "failed" as const,
		pending: false,
		uses: 1,
	},
];

describe("LibraryPanel", () => {
	test("lists the recordings sorted with their length, channels and uses; the filter narrows them", async () => {
		const user = userEvent.setup();
		render(LibraryPanel, { props: { items, playing: null, onpreview: vi.fn() } });
		const list = screen.getByRole("list", { name: "Recordings in the library" });
		expect([...list.querySelectorAll("li")].map((li) => li.getAttribute("aria-label"))).toEqual([
			"Bass, 0:04.0",
			"Guitar take, 0:12.5",
			"Lost, 0:01.0",
		]);
		expect(list).toHaveTextContent("0:12.5 · stereo · 2 clips");
		expect(list).toHaveTextContent("0:04.0 · mono · saving…");
		expect(list).toHaveTextContent("· not loaded");
		expect(screen.getByRole("button", { name: "Play Lost" })).toBeDisabled();
		await user.type(screen.getByRole("searchbox", { name: "Find a recording" }), "gui");
		expect(list.querySelectorAll("li")).toHaveLength(1);
	});
	test("play and stop go to the caller; a drag carries the recording's id", async () => {
		const user = userEvent.setup();
		const onpreview = vi.fn();
		const { rerender } = render(LibraryPanel, { props: { items, playing: null, onpreview } });
		await user.click(screen.getByRole("button", { name: "Play Guitar take" }));
		expect(onpreview).toHaveBeenLastCalledWith("s1");
		await rerender({ items, playing: "s1", onpreview });
		await user.click(screen.getByRole("button", { name: "Stop Guitar take" }));
		expect(onpreview).toHaveBeenLastCalledWith(null);
		const data = new Map<string, string>();
		const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), effectAllowed: "" };
		await fireEvent.dragStart(document.querySelector('[data-library-item="s1"]')!, {
			dataTransfer,
		});
		expect(data.get("application/x-stemshovel-source")).toBe("s1");
		expect(dataTransfer.effectAllowed).toBe("copy");
	});
	test("says so when the library is empty", () => {
		render(LibraryPanel, { props: { items: [], playing: null, onpreview: vi.fn() } });
		expect(screen.getByText(/No recordings yet/)).toBeInTheDocument();
	});
});
