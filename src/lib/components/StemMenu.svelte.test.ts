import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";

beforeAll(installFakePopover);

/** The stem menu over stand-in remote forms that never submit. */
const forms = vi.hoisted(() => {
	const form = {
		enhance: () => ({}),
		pending: 0,
		fields: { id: { as: (type: string, value: string) => ({ name: "id", type, value }) } },
	};
	return {
		deleteStem: { for: () => form },
		removeStemMidi: { for: () => form },
		renameStem: vi.fn(),
		reorderStems: vi.fn(),
		setSongVersion: vi.fn(),
		setStemTint: vi.fn(),
	};
});
vi.mock("#lib/remote/songs.remote.js", () => forms);
const saveAs = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("#lib/upload.js", () => ({ saveAs }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: StemMenu } = await import("./StemMenu.svelte");
const { StemActions } = await import("#lib/state/stemActions.svelte.js");

const stem = { id: "s1", label: "Bass", tint: "sea" } as never;
const row = {
	url: "https://blob/bass.wav",
	filename: "bass.wav",
	sizeBytes: 2048,
	sampleRate: 48000,
	midiUrl: "https://blob/bass.mid",
	midiFilename: "bass.mid",
};

function setup(canEdit: boolean, withRow = true) {
	const r = withRow ? row : undefined;
	const actions = new StemActions({
		song: () => ({ id: "song1", version: "1.0.0" }),
		onsaved: vi.fn(),
	});
	const tint = vi.spyOn(actions, "tint").mockResolvedValue();
	const rename = vi.spyOn(actions, "rename").mockResolvedValue();
	const { container } = render(StemMenu, { props: { stem, row: r, actions, canEdit } });
	return { actions, tint, rename, container };
}

describe("StemMenu", () => {
	test("a member's menu: the file line, downloads, MIDI, Rename, the tint, a new version and Remove", async () => {
		const user = userEvent.setup();
		const { tint, rename } = setup(true);
		await user.click(screen.getByRole("button", { name: "Bass: options" }));
		expect(screen.getByText(/bass\.wav · 2 KB · 48 kHz/)).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Download Stem" }));
		expect(saveAs).toHaveBeenCalledWith("https://blob/bass.wav", "bass.wav");
		expect(screen.getByRole("button", { name: "Download MIDI" })).toBeTruthy();
		expect(screen.getByText("Replace MIDI")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Remove MIDI" })).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Rename" }));
		expect(rename).toHaveBeenCalledWith("s1", "Bass");
		expect(screen.getByRole("button", { name: "Tint Sea" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await fireEvent.click(screen.getByRole("button", { name: "No tint" }));
		expect(tint).toHaveBeenCalledWith("s1", null);
		expect(screen.getByText("Upload new version")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
	});

	test("a replace in flight and a MIDI error show on the menu", async () => {
		const user = userEvent.setup();
		const { actions } = setup(true);
		actions.replacing.s1 = { percent: 42.4, stage: "uploading" };
		actions.midiJobs.s1 = { percent: 0, error: "bass.wav is not a MIDI file (.mid or .midi)." };
		await user.click(screen.getByRole("button", { name: "Bass: options" }));
		expect(screen.getByText("Uploading 42%")).toBeTruthy();
		expect(screen.getByText("bass.wav is not a MIDI file (.mid or .midi).")).toBeTruthy();
	});

	test("a listener's menu has the downloads only", async () => {
		const user = userEvent.setup();
		setup(false);
		await user.click(screen.getByRole("button", { name: "Bass: options" }));
		expect(screen.getByRole("button", { name: "Download Stem" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
		expect(screen.queryByText("Upload new version")).toBeNull();
		expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
	});

	test("no row, no menu", () => {
		const { container } = setup(true, false);
		expect(container.querySelector("button")).toBeNull();
	});
});
