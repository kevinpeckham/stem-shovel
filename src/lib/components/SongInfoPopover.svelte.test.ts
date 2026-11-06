import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import SongInfoPopover from "./SongInfoPopover.svelte";

/** The song-info popover: the lines it spells out from the song, and the hint for a member when nothing is filled in. */
const account = { slug: "mmkk", name: "MMKK" };
const project = { slug: "badverbs", name: "Badverbs" };

describe("SongInfoPopover", () => {
	test("spells out the description, credits, music and stems", () => {
		const { container } = render(SongInfoPopover, {
			song: {
				title: "Letter Lands",
				description: "A song about letters.",
				version: "1.2.0",
				writtenOn: "2019-06-01",
				stemsUpdatedAt: new Date("2026-10-01T12:00:00Z"),
				changes: [
					{ kind: "tempo", value: "120", start: 0 },
					{ kind: "key", value: "C major", start: 0 },
					{ kind: "key", value: "F major", start: 30 },
					{ kind: "meter", value: "4/4", start: 0 },
				],
				credits: [
					{ role: "composer", artist: { name: "Kevin" } },
					{ role: "producer", artist: { name: "Mia" } },
					{ role: "performer", artist: { name: "Badverbs" } },
					{ role: "composer", artist: null },
				],
				project,
			},
			account,
			readyCount: 1,
			canEdit: true,
		});
		const popover = container.querySelector("#song-info")!;
		expect(popover.getAttribute("popover")).toBe("auto");
		expect(screen.getByText("A song about letters.")).toBeTruthy();
		expect(screen.getByText("Kevin, produced by Mia, first written June 2019")).toBeTruthy();
		expect(popover.textContent).toContain("C major (also F major)");
		expect(popover.textContent).toContain("v1.2.0");
		expect(popover.textContent).toMatch(/1\s+stem, last changed/);
		const link = screen.getByText("Badverbs").closest("a")!;
		expect(link.getAttribute("href")).toBe("/mmkk/projects/badverbs");
		expect(link.className).toBe("link");
		expect(screen.queryByText(/Add a description/)).toBeNull();
	});

	const bare = {
		title: "Untitled",
		description: null,
		version: "0.1.0",
		writtenOn: null,
		stemsUpdatedAt: null,
		changes: [],
		credits: [],
		project,
	};

	test("a member sees the hint when nothing is filled in", () => {
		const { container } = render(SongInfoPopover, {
			song: bare,
			account,
			readyCount: 3,
			canEdit: true,
		});
		expect(screen.getByText(/Add a description, credits/)).toBeTruthy();
		expect(container.textContent).toMatch(/3\s+stems/);
		expect(screen.queryByText("Written")).toBeNull();
		expect(screen.queryByText("Music")).toBeNull();
	});

	test("a listener does not see the hint", () => {
		render(SongInfoPopover, { song: bare, account, readyCount: 0, canEdit: false });
		expect(screen.queryByText(/Add a description/)).toBeNull();
	});
});
