import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import SectionTimeline from "./SectionTimeline.svelte";

const sections = [
	{ name: "Intro", start: 0 },
	{ name: "Verse", start: 90 },
];
const fixed: SongChange[] = [
	{ kind: "tempo", start: 0, value: "120" },
	{ kind: "meter", start: 0, value: "4/4" },
];

describe("SectionTimeline", () => {
	test("blocks hold the abbreviation and the name, swapped by the block's width; the name and span in bars are the tooltip", () => {
		render(SectionTimeline, {
			props: { engine: fakeEngine({ position: 100 }), sections, changes: fixed },
		});
		const blocks = screen.getAllByRole("tab");
		expect(blocks.map((b) => b.getAttribute("aria-label"))).toEqual(["Intro", "Verse"]);
		expect(blocks[0].className).toContain("[container-type:inline-size]");
		const [short, full] = blocks[0].querySelectorAll("span");
		expect(short).toHaveTextContent("In");
		expect(short.className).toContain("@[7rem]-hidden");
		expect(full).toHaveTextContent("Intro");
		expect(full.className).toContain("hidden @[7rem]-inline");
		expect(blocks[0]).toHaveAttribute("title", "Intro · 45 bars · click to select and go there");
		expect(blocks[1]).toHaveAttribute("title", expect.stringContaining("Verse · "));
	});
	test("a recurring name is numbered on the timeline", () => {
		render(SectionTimeline, {
			props: {
				engine: fakeEngine(),
				sections: [
					{ name: "Verse", start: 0 },
					{ name: "Chorus", start: 30 },
					{ name: "Verse", start: 60 },
				],
			},
		});
		const shorts = screen.getAllByRole("tab").map((b) => b.querySelector("span")?.textContent);
		expect(shorts).toEqual(["V1", "Ch", "V2"]);
	});
	test("the block containing the playhead is selected", () => {
		render(SectionTimeline, { props: { engine: fakeEngine({ position: 100 }), sections } });
		expect(screen.getByRole("tab", { name: "Verse" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByRole("tab", { name: "Intro" })).toHaveAttribute("aria-selected", "false");
	});
	test("clicking a block selects it as the loop's stretch and seeks to its start", async () => {
		const user = userEvent.setup();
		const seek = vi.fn();
		const setLoop = vi.fn();
		render(SectionTimeline, { props: { engine: fakeEngine({ seek, setLoop }), sections } });
		await user.click(screen.getByRole("tab", { name: "Verse" }));
		expect(setLoop).toHaveBeenCalledWith({ start: 90, end: 256.7 });
		expect(seek).toHaveBeenCalledWith(90);
	});
	test("the selected block is marked, and clicking it again clears the selection", async () => {
		const user = userEvent.setup();
		const seek = vi.fn();
		const setLoop = vi.fn();
		render(SectionTimeline, {
			props: { engine: fakeEngine({ seek, setLoop, loop: { start: 90, end: 256.7 } }), sections },
		});
		const block = screen.getByRole("tab", { name: "Verse" });
		expect(block).toHaveAttribute("data-selected", "true");
		expect(block).toHaveAttribute(
			"title",
			expect.stringContaining("selected (click again to clear)"),
		);
		await user.click(block);
		expect(setLoop).toHaveBeenCalledWith(null);
		expect(seek).not.toHaveBeenCalled();
	});
	test("without a tempo and meter the tooltip falls back to the timecode range", () => {
		render(SectionTimeline, { props: { engine: fakeEngine(), sections } });
		expect(screen.getByRole("tab", { name: "Intro" })).toHaveAttribute(
			"title",
			"Intro · 00:00:00.00 – 01:30:00.00 · click to select and go there",
		);
	});
	test("a kind with a single change at 0:00 draws no marker; a change does, and the one in force is highlighted", () => {
		const changes: SongChange[] = [...fixed, { kind: "tempo", start: 60, value: "140" }];
		render(SectionTimeline, {
			props: { engine: fakeEngine({ position: 70 }), sections: [], changes },
		});
		const markers = screen.getAllByTitle(/ from /);
		expect(markers.map((m) => m.getAttribute("title"))).toEqual([
			"120 bpm from 1 | 1 · jump there",
			"140 bpm from 31 | 1 · jump there",
		]);
		expect(markers[1].className).toContain("border-accent");
		expect(markers[0].className).not.toContain("border-accent");
		expect(screen.getByRole("group", { name: "Song sections" })).toHaveTextContent("140 bpm");
	});
	test("a song in several keys lays each on the key lane, the one in force lit, and a click on one seeks there", async () => {
		const user = userEvent.setup();
		const seek = vi.fn();
		const changes: SongChange[] = [
			...fixed,
			{ kind: "key", start: 0, value: "C major" },
			{ kind: "key", start: 60, value: "A♭ major" },
			{ kind: "key", start: 120, value: "F major" },
		];
		render(SectionTimeline, {
			props: { engine: fakeEngine({ position: 70, seek }), sections: [], changes },
		});
		// The list of keys under the section name went (Kevin): the word stays as the lane's label, the lane is the list.
		expect(screen.getByText("keys:")).toBeInTheDocument();
		expect(screen.queryByText("key:")).toBeNull();
		const keys = screen.getAllByRole("button", { name: /major/ });
		expect(keys.map((k) => k.textContent?.trim())).toEqual(["C major", "A♭ major", "F major"]);
		expect(keys[1].className).toContain("border-accent");
		expect(keys[0].className).not.toContain("border-accent");
		await user.click(keys[2]);
		expect(seek).toHaveBeenCalledWith(120);
	});
	test("one key draws no marker: the header names it", () => {
		render(SectionTimeline, {
			props: {
				engine: fakeEngine(),
				sections: [],
				changes: [...fixed, { kind: "key", start: 0, value: "D major" }],
			},
		});
		expect(screen.queryByText("keys:")).toBeNull();
	});
});
