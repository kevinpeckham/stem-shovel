import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The song settings popover over stand-ins: the three extracted tabs are
 * stubs (each has its own test), and every remote function is a form-shaped
 * stand-in that is never submitted.
 */
const remoteStub = vi.hoisted(() => {
	const field = { as: () => ({}), value: () => undefined };
	const fields = new Proxy({}, { get: () => field });
	const form = { enhance: () => ({}), fields, pending: 0, result: undefined, for: () => form };
	return (...names: string[]) => Object.fromEntries(names.map((n) => [n, form]));
});
vi.mock("#lib/remote/songs.remote.js", () =>
	remoteStub("deleteDemo", "deleteSong", "setSongStage"),
);
vi.mock("#lib/remote/ai.remote.js", () => remoteStub("setProjectAi", "setSongAi"));
vi.mock("#lib/remote/share.remote.js", () => remoteStub("setProjectPrivate", "setSongPrivate"));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));
vi.mock("#lib/components/SongDetailsTab.svelte", () => ({ default: () => {} }));
vi.mock("#lib/components/SongSectionsTab.svelte", () => ({ default: () => {} }));
vi.mock("#lib/components/SongTempoKeyTab.svelte", () => ({ default: () => {} }));

const { default: SongSettingsPopover } = await import("./SongSettingsPopover.svelte");
const { DemoUploads } = await import("#lib/state/demoUploads.svelte.js");

function setup() {
	const song = {
		id: "song1",
		title: "Letter Lands",
		slug: "letter-lands",
		description: "",
		writtenOn: null,
		version: "1.0.0",
		frameRate: 25,
		startAt: null,
		endAt: null,
		stage: null,
		noAi: false,
		isPrivate: false,
		project: { slug: "badverbs", noAi: false, isPrivate: false },
		credits: [],
		demos: [
			{
				id: "d1",
				label: "Kitchen take",
				sizeBytes: 2048,
				status: "ready",
				playbackStatus: "ready",
			},
		],
	};
	const demos = new DemoUploads({ song: () => song, onuploaded: async () => {} });
	const reset = vi.fn();
	// The tab stubs never read the other instances; the popover only resets three of them on open.
	const stand = { reset } as never;
	const props = {
		details: stand,
		sections: stand,
		changes: stand,
		chordDraft: stand,
		check: stand,
		demos,
		song,
		artists: [],
		accountSlug: "mmkk",
		engine: null,
		grid: null,
		hasScore: false,
		aiAvailable: true,
		noAi: false,
		canEdit: true,
		canReview: false,
		onreview: () => {},
		stage: "writing" as const,
		draftCard: createRawSnippet(() => ({ render: () => "<div>draft card</div>" })),
	};
	return { demos, props, reset };
}

/** Open the popover as the gear does (jsdom has no popover API): beforetoggle, then shown. */
function open() {
	const el = document.getElementById("song-settings")!;
	el.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState: "open" }));
	el.style.display = "flex";
}

const nav = () => screen.getByRole("navigation", { name: "Settings panels" });

describe("SongSettingsPopover", () => {
	test("the five tab buttons, Details current", () => {
		const { props } = setup();
		render(SongSettingsPopover, { props });
		open();
		const tabs = within(nav()).getAllByRole("button");
		expect(tabs.map((b) => b.textContent?.trim())).toEqual([
			"Details",
			"Sections",
			"Tempo & key",
			"Demos",
			"Options",
		]);
		expect(within(nav()).getByRole("button", { name: "Details" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("a click switches tabs: Demos shows its list and the Upload demo control", async () => {
		const { props } = setup();
		render(SongSettingsPopover, { props });
		open();
		await fireEvent.click(within(nav()).getByRole("button", { name: "Demos" }));
		expect(within(nav()).getByRole("button", { name: "Demos" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(within(nav()).getByRole("button", { name: "Details" })).not.toHaveAttribute(
			"aria-current",
		);
		expect(screen.getByRole("heading", { name: "Demo recordings" })).toBeTruthy();
		expect(screen.getByText(/Kitchen take/)).toBeTruthy();
		expect(screen.getByLabelText("Upload demo")).toHaveAttribute("type", "file");
	});

	test("the Demos tab shows the uploads' notice and jobs", async () => {
		const { props, demos } = setup();
		demos.notice = "Over the limit";
		demos.jobs = [{ name: "take.wav", percent: 42 }];
		render(SongSettingsPopover, { props });
		open();
		await fireEvent.click(within(nav()).getByRole("button", { name: "Demos" }));
		expect(screen.getByRole("alert")).toHaveTextContent("Over the limit");
		expect(screen.getByText("take.wav: 42%")).toBeTruthy();
	});

	test("Options shows the stage control, the switches and Delete song", async () => {
		const { props } = setup();
		render(SongSettingsPopover, { props });
		open();
		await fireEvent.click(within(nav()).getByRole("button", { name: "Options" }));
		expect(screen.getByRole("heading", { name: /Stage: Writing/ })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Delete this song" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete song" })).toBeTruthy();
	});

	test("showTab moves the popover to a tab from outside", async () => {
		const { props } = setup();
		const { component } = render(SongSettingsPopover, { props });
		open();
		component.showTab("options");
		await Promise.resolve();
		expect(screen.getByRole("heading", { name: "Delete this song" })).toBeTruthy();
		expect(screen.getByLabelText("Settings panel")).toHaveTextContent("Options");
	});

	test("opening resets the Details, Sections and Tempo & key entries to the saved values", () => {
		const { props, reset } = setup();
		render(SongSettingsPopover, { props });
		open();
		expect(reset).toHaveBeenCalledTimes(3);
	});
});
