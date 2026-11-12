import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The settings' Details tab over a real SongDetails; the remote form is a
 * stand-in whose fields give their defaults as attributes and hold nothing
 * typed, and nothing is submitted.
 */
const updateSong = vi.hoisted(() => {
	const field = (name: string) => ({
		as: (type: string, value: string) =>
			type === "select" ? { name, value } : { name, type, value },
		value: () => undefined,
		set: () => {},
		issues: () => undefined,
	});
	const names = ["id", "title", "slug", "description", "writtenOn", "version", "frameRate"];
	const fields = Object.fromEntries(
		[...names, "startAt", "endAt"].map((n) => [n, field(n)]),
	) as Record<string, ReturnType<typeof field>>;
	return {
		fields: Object.assign(fields, { set: () => {}, allIssues: () => undefined }),
		enhance: () => ({ method: "POST", action: "?/remote" }),
		pending: 0,
	};
});
vi.mock("#lib/remote/songs.remote.js", () => ({ updateSong }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongDetailsTab } = await import("./SongDetailsTab.svelte");
const { SongChanges } = await import("#lib/state/songChanges.svelte.js");
const { SongDetails } = await import("#lib/state/songDetails.svelte.js");

function setup(over: { slug?: string; startAt?: number | null; endAt?: number | null } = {}) {
	const song = {
		id: "song1",
		title: "Letter Lands",
		slug: "letter-lands",
		description: "A song about letters",
		writtenOn: null,
		version: "1.2.0",
		frameRate: 25,
		startAt: null,
		endAt: null,
		changes: [],
		project: { slug: "badverbs" },
		credits: [{ id: "c1", role: "composer" as const, artist: { name: "Kevin" } }],
		...over,
	};
	const changes = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved: async () => {},
	});
	const details = new SongDetails({ song: () => song, changes, onsaved: async () => {} });
	details.reset();
	const props = {
		details,
		changes,
		song,
		artists: [{ id: "a1", name: "Kevin" }],
		accountSlug: "mmkk",
		engine: null,
		onsaved: () => {},
	};
	return { details, props };
}

describe("SongDetailsTab", () => {
	test("the fields show the song's values; Save waits for a change", () => {
		const { props } = setup();
		render(SongDetailsTab, { props });
		expect(screen.getByLabelText("Title")).toHaveValue("Letter Lands");
		expect(screen.getByText("/projects/badverbs/")).toBeTruthy();
		expect(screen.getByLabelText(/Description/)).toHaveValue("A song about letters");
		expect(screen.getByLabelText(/^Version/)).toHaveValue("1.2.0");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(screen.queryByRole("button", { name: "Use title" })).toBeNull();
	});

	test("Use title when the slug is not the title's", () => {
		const { props } = setup({ slug: "old-name" });
		render(SongDetailsTab, { props });
		expect(screen.getByRole("button", { name: "Use title" })).toBeTruthy();
	});

	test("the position error when the instance has one", () => {
		const { props, details } = setup();
		details.positionError = "End: not a position";
		render(SongDetailsTab, { props });
		expect(screen.getByRole("alert")).toHaveTextContent("End: not a position");
	});

	test("a credit row with its Remove, and Add waits for a name", () => {
		const { props } = setup();
		render(SongDetailsTab, { props });
		expect(screen.getByRole("list", { name: "Composers" })).toHaveTextContent("Kevin");
		expect(screen.getByRole("button", { name: "Remove Kevin as composer" })).toBeEnabled();
		expect(screen.getAllByRole("button", { name: "Add" })[0]).toBeDisabled();
	});

	test("Main edits the start of bar 1 and the end here", () => {
		const { props } = setup();
		render(SongDetailsTab, { props });
		expect(screen.getByLabelText("Start of bar 1")).toBeTruthy();
		expect(document.querySelector("[data-arrangement-span-note]")).toBeNull();
	});

	test("on an alternate the entries go and the song's own start and end ride along unchanged", () => {
		const { props } = setup({ startAt: 2.5, endAt: 180 });
		render(SongDetailsTab, { props: { ...props, onAlternate: true } });
		expect(screen.queryByLabelText("Start of bar 1")).toBeNull();
		expect(screen.queryByLabelText("End")).toBeNull();
		expect(document.querySelector("[data-arrangement-span-note]")?.textContent).toContain(
			"This arrangement's start of bar 1 and end are under Tempo & key.",
		);
		expect(document.querySelector<HTMLInputElement>('input[name="startAt"]')?.value).toBe("2.5");
		expect(document.querySelector<HTMLInputElement>('input[name="endAt"]')?.value).toBe("180");
	});
});
