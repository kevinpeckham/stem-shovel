import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import type { SongChange } from "$lib/val/SongChangeSchema";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import SectionTimeline from "./SectionTimeline.svelte";

const sections = [
	{ index: "I", name: "Intro", start: 0 },
	{ index: "II", name: "Verse", start: 90 },
];
const fixed: SongChange[] = [
	{ kind: "tempo", start: 0, value: "120" },
	{ kind: "meter", start: 0, value: "4/4" },
];

describe("SectionTimeline", () => {
	test("blocks show the index; the name and span in bars are the tooltip", () => {
		render(SectionTimeline, {
			props: { engine: fakeEngine({ position: 100 }), sections, changes: fixed },
		});
		const blocks = screen.getAllByRole("tab");
		expect(blocks.map((b) => b.textContent?.trim())).toEqual(["I", "II"]);
		expect(blocks[0]).toHaveAttribute("title", "I · Intro · 45 bars");
		expect(blocks[1]).toHaveAttribute("title", expect.stringContaining("II · Verse · "));
	});
	test("the block containing the playhead is selected", () => {
		render(SectionTimeline, { props: { engine: fakeEngine({ position: 100 }), sections } });
		expect(screen.getByRole("tab", { name: "II" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByRole("tab", { name: "I" })).toHaveAttribute("aria-selected", "false");
	});
	test("clicking a block seeks to its start", async () => {
		const user = userEvent.setup();
		const seek = vi.fn();
		render(SectionTimeline, { props: { engine: fakeEngine({ seek }), sections } });
		await user.click(screen.getByRole("tab", { name: "II" }));
		expect(seek).toHaveBeenCalledWith(90);
	});
	test("without a tempo and meter the tooltip falls back to the time range", () => {
		render(SectionTimeline, { props: { engine: fakeEngine(), sections } });
		expect(screen.getByRole("tab", { name: "I" })).toHaveAttribute(
			"title",
			"I · Intro · 0:00.0 – 1:30.0",
		);
	});
	test("a kind with a single change at 0:00 draws no marker; a change does, and the one in force is highlighted", () => {
		const changes: SongChange[] = [...fixed, { kind: "tempo", start: 60, value: "140" }];
		render(SectionTimeline, {
			props: { engine: fakeEngine({ position: 70 }), sections: [], changes },
		});
		const markers = screen.getAllByTitle(/ from /);
		expect(markers.map((m) => m.getAttribute("title"))).toEqual([
			"120 bpm from 0:00.0",
			"140 bpm from 1:00.0",
		]);
		expect(markers[1].className).toContain("border-maximumYellow");
		expect(markers[0].className).not.toContain("border-maximumYellow");
		expect(screen.getByRole("group", { name: "Song sections" })).toHaveTextContent("140 bpm");
	});
});
