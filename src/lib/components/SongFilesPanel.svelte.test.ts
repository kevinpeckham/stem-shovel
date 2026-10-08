import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick, type ComponentProps } from "svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { FILE_MAX_BYTES, MAX_FILES_PER_SONG } from "#lib/constants/fileFormats.js";

/**
 * The Attachments tab (docs/uploads-and-blob.md, "Attachments"): what the
 * tiles show for each kind, the filter chips, the ⋯ and Share menus and
 * what they call, editing, the viewer panel, the upload picker's rules,
 * and the project view's move-to-song select. The remote functions, the
 * upload helpers and the page's refresh are doubles.
 */
const h = vi.hoisted(() => ({
	refreshAll: vi.fn(async () => {}),
	notify: vi.fn(),
	updateFile: vi.fn(async () => ({})),
	deleteFile: vi.fn(async () => ({})),
	attachFile: vi.fn(async () => ({})),
	useAsDemo: vi.fn(async () => ({})),
	uploadFile: vi.fn(
		async (_f: File, reserve: () => Promise<unknown>, _onProgress?: (p: number) => void) => {
			await reserve();
			return { shareCode: "x", kind: "pdf" as const };
		},
	),
	postJson: vi.fn(async (_path: string, _payload: unknown) => ({ fileId: "f", pathname: "p" })),
	shortenShareLink: vi.fn(async (url: string) => `https://sho.rt/${url.split("/").pop()}`),
	page: { url: new URL("https://www.stemshovel.com/mmkk/projects/p/s") },
}));
vi.mock("$app/state", () => ({ page: h.page }));
vi.mock("$app/navigation", () => ({ refreshAll: h.refreshAll }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/remote/files.remote.js", () => ({
	updateFile: h.updateFile,
	deleteFile: h.deleteFile,
	attachFile: h.attachFile,
	useAsDemo: h.useAsDemo,
}));
vi.mock("#lib/upload.js", () => ({ uploadFile: h.uploadFile, postJson: h.postJson }));
vi.mock("#lib/utils/shortenShareLink.js", () => ({ shortenShareLink: h.shortenShareLink }));

const { default: SongFilesPanel } = await import("./SongFilesPanel.svelte");
type Props = ComponentProps<typeof SongFilesPanel>;
type PanelFile = Props["files"][number];

const file = (over: Partial<PanelFile> & { id: string }): PanelFile => ({
	kind: "pdf",
	title: "",
	description: "",
	filename: `${over.id}.pdf`,
	sizeBytes: 2048,
	pageCount: null,
	url: `https://store/${over.id}`,
	thumbnailUrl: null,
	shareCode: `code-${over.id}`,
	status: "ready",
	isNotation: false,
	...over,
});
const chart = file({
	id: "chart",
	title: "Lead sheet",
	filename: "lead.pdf",
	pageCount: 3,
	thumbnailUrl: "https://store/chart.webp",
	isNotation: true,
	sizeBytes: 1536,
});
const photo = file({ id: "photo", kind: "image", filename: "band.jpg", description: "At the gig" });
const scrap = file({ id: "scrap", kind: "audio", filename: "idea.m4a", sizeBytes: 3_000_000 });
const notes = file({ id: "notes", kind: "text", filename: "notes.txt" });
const pending = file({ id: "pending", status: "uploading", url: "" });

const base = (over: Partial<Props> = {}): Props => ({
	songId: "song-1",
	songTitle: "Eat All the Clocks",
	files: [chart, photo, scrap, notes, pending],
	canEdit: true,
	...over,
});

beforeAll(installFakePopover);
beforeEach(() => {
	vi.clearAllMocks();
	h.refreshAll.mockResolvedValue(undefined);
});

const tile = (name: string) => screen.getByRole("listitem", { name });
async function openMenu(user: ReturnType<typeof userEvent.setup>, label: string) {
	await user.click(screen.getByRole("button", { name: label }));
}
/** The labels of the open ContextMenu's items (buttons and links inside the shown popover). */
const menuItems = () => {
	const open = [...document.querySelectorAll<HTMLElement>("[popover]")].find(
		(el) => el.style.display !== "none",
	);
	return [...(open?.querySelectorAll("button, a") ?? [])].map((el) => el.textContent?.trim());
};
const clipboard = () => navigator.clipboard.readText();

describe("SongFilesPanel: tiles", () => {
	test("lists ready files only, with the kind, pages, size and notation on the info line, and a thumbnail or icon", () => {
		render(SongFilesPanel, { props: base() });
		const list = screen.getByRole("list", { name: "Attachment list" });
		expect(
			within(list)
				.getAllByRole("listitem")
				.map((li) => li.getAttribute("aria-label")),
		).toEqual(["Lead sheet", "band.jpg", "idea.m4a", "notes.txt"]);
		expect(tile("Lead sheet")).toHaveTextContent("PDF · 3 pages · 2 KB · notation");
		expect(within(tile("Lead sheet")).getByRole("img")).toHaveAttribute(
			"src",
			"https://store/chart.webp",
		);
		expect(within(tile("band.jpg")).getByRole("img")).toHaveAttribute("src", "https://store/photo");
		expect(tile("band.jpg")).toHaveTextContent("At the gig");
		expect(tile("idea.m4a").querySelector("audio")).toHaveAttribute("src", "https://store/scrap");
		expect(
			within(tile("notes.txt")).getByRole("button", { name: "Open notes.txt" }),
		).toBeInTheDocument();
		expect(screen.queryByText("pending.pdf")).toBeNull();
	});
	test("a MusicXML score is listed too, with a download link and a mention button, and says it lives on the Chart tab", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, {
			props: base({
				files: [],
				scores: [
					{
						id: "sc",
						title: "",
						filename: "lead.musicxml",
						sizeBytes: 4096,
						shareCode: "sc-code",
						status: "ready",
					},
					{
						id: "no",
						title: "x",
						filename: "x.mxl",
						sizeBytes: 1,
						shareCode: "n",
						status: "uploading",
					},
				],
			}),
		});
		const score = tile("lead.musicxml");
		expect(score).toHaveTextContent("4 KB · score, on the Chart tab");
		expect(within(score).getByRole("link", { name: "Download the MusicXML file" })).toHaveAttribute(
			"href",
			"/f/sc-code?download=1",
		);
		expect(screen.queryByRole("listitem", { name: "x" })).toBeNull();
		await user.click(within(score).getByRole("button", { name: "Copy a mention for the notes" }));
		expect(await clipboard()).toBe("@lead.musicxml");
		expect(h.notify).toHaveBeenCalledWith("Mention copied");
	});
	test("says so when there is nothing yet, with the upload hint for an editor only", () => {
		const { unmount } = render(SongFilesPanel, { props: base({ files: [], canEdit: false }) });
		expect(screen.getByText(/No attachments yet\./)).not.toHaveTextContent("Upload a chart");
		expect(screen.queryByText("Upload Attachments")).toBeNull();
		unmount();
		render(SongFilesPanel, { props: base({ files: [] }) });
		expect(screen.getByText(/No attachments yet\./)).toHaveTextContent("Upload a chart, a photo");
		expect(screen.getByText("Upload Attachments")).toBeInTheDocument();
	});
	test("filter chips appear with a mixed set and narrow the list by kind or to the scores", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		const chips = screen.getByRole("group", { name: "Show" });
		expect(
			within(chips)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["All (4)", "Scores (1)", "Audio (1)", "PDF (1)", "Image (1)", "Text (1)"]);
		await user.click(within(chips).getByRole("button", { name: "Image (1)" }));
		expect(within(chips).getByRole("button", { name: "Image (1)" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual([
			"band.jpg",
		]);
		await user.click(within(chips).getByRole("button", { name: "Scores (1)" }));
		expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual([
			"Lead sheet",
		]);
	});
	test("no chips for a single kind", () => {
		render(SongFilesPanel, { props: base({ files: [file({ id: "one" }), file({ id: "two" })] }) });
		expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
	});
});

describe("SongFilesPanel: the ⋯ menu", () => {
	test("offers open, download, a new tab, and for an editor edit, notation (PDFs and images), use as demo (audio) and remove", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Actions for Lead sheet");
		const labels = menuItems;
		expect(labels()).toEqual([
			"Open",
			"Download",
			"Open in a new tab",
			"Edit",
			"Notation",
			"Remove",
		]);
		expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
			"href",
			"/f/code-chart?download=1",
		);
		expect(screen.getByRole("link", { name: "Open in a new tab" })).toHaveAttribute(
			"target",
			"_blank",
		);
		await user.keyboard("{Escape}");
		await openMenu(user, "Actions for idea.m4a");
		expect(labels()).toEqual([
			"Open",
			"Download",
			"Open in a new tab",
			"Edit",
			"Use as demo",
			"Remove",
		]);
		await user.keyboard("{Escape}");
		await openMenu(user, "Actions for notes.txt");
		expect(labels()).toEqual(["Open", "Download", "Open in a new tab", "Edit", "Remove"]);
	});
	test("a viewer gets open, download and the new tab only", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base({ canEdit: false }) });
		await openMenu(user, "Actions for Lead sheet");
		expect(menuItems()).toEqual(["Open", "Download", "Open in a new tab"]);
	});
	test("Edit opens the form with the current words; Save sends them and refreshes; Cancel does not", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Actions for band.jpg");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		const title = screen.getByRole("textbox", { name: "Title" });
		const description = screen.getByRole("textbox", { name: "Description" });
		expect(title).toHaveValue("");
		expect(description).toHaveValue("At the gig");
		await user.type(title, "Gig photo");
		await user.clear(description);
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(h.updateFile).toHaveBeenCalledWith({ id: "photo", title: "Gig photo", description: "" });
		expect(h.refreshAll).toHaveBeenCalledTimes(1);
		await tick();
		expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();

		await openMenu(user, "Actions for band.jpg");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(h.updateFile).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	});
	test("a failed save is told as a notification and the form stays", async () => {
		const user = userEvent.setup();
		h.updateFile.mockRejectedValueOnce(new Error("Not yours"));
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Actions for band.jpg");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(h.notify).toHaveBeenCalledWith("Could not save: Not yours", { kind: "error" });
		expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
	});
	test("Remove asks first; a yes deletes, notifies and refreshes, a no does nothing", async () => {
		const user = userEvent.setup();
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Actions for notes.txt");
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(confirm).toHaveBeenCalledWith('Remove "notes.txt" from this song? The file is deleted.');
		expect(h.deleteFile).not.toHaveBeenCalled();
		confirm.mockReturnValue(true);
		await openMenu(user, "Actions for notes.txt");
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(h.deleteFile).toHaveBeenCalledWith({ id: "notes" });
		await tick();
		expect(h.notify).toHaveBeenCalledWith("notes.txt removed");
		expect(h.refreshAll).toHaveBeenCalledTimes(1);
		confirm.mockRestore();
	});
	test("Notation toggles a PDF's score flag; Use as demo copies an audio file to the demos", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Actions for Lead sheet");
		await user.click(screen.getByRole("button", { name: "Notation" }));
		expect(h.updateFile).toHaveBeenCalledWith({
			id: "chart",
			title: "Lead sheet",
			description: "",
			isNotation: false,
		});
		await tick();
		expect(h.notify).toHaveBeenCalledWith("Lead sheet is a plain file again");
		await openMenu(user, "Actions for idea.m4a");
		await user.click(screen.getByRole("button", { name: "Use as demo" }));
		expect(h.useAsDemo).toHaveBeenCalledWith({ id: "scrap" });
		await tick();
		expect(h.notify).toHaveBeenCalledWith(
			"idea.m4a is a demo now: find it on the player's Demos tab",
		);
		expect(h.refreshAll).toHaveBeenCalledTimes(2);
	});
});

describe("SongFilesPanel: sharing and the viewer", () => {
	test("Copy link copies the short form of the permanent link; Copy mention copies @Title; email is a mailto with the link", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Share Lead sheet");
		await user.click(screen.getByRole("button", { name: "Copy link" }));
		expect(h.shortenShareLink).toHaveBeenCalledWith(
			"https://www.stemshovel.com/f/code-chart",
			"other",
		);
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Link copied"));
		expect(await clipboard()).toBe("https://sho.rt/code-chart");
		await openMenu(user, "Share Lead sheet");
		await user.click(screen.getByRole("button", { name: "Copy mention" }));
		expect(await clipboard()).toBe("@Lead sheet");
		await openMenu(user, "Share Lead sheet");
		const mail = screen.getByRole("link", { name: "Share via email" });
		expect(mail.getAttribute("href")).toBe(
			`mailto:?subject=${encodeURIComponent("Eat All the Clocks: Lead sheet")}&body=${encodeURIComponent("Lead sheet\nhttps://www.stemshovel.com/f/code-chart")}`,
		);
	});
	test("when the clipboard refuses, the text itself is shown as the notification", async () => {
		const user = userEvent.setup();
		// After setup, so this stub replaces user-event's clipboard.
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: vi.fn(async () => {
					throw new Error("denied");
				}),
			},
			configurable: true,
		});
		render(SongFilesPanel, { props: base() });
		await openMenu(user, "Share Lead sheet");
		await user.click(screen.getByRole("button", { name: "Copy mention" }));
		await tick();
		expect(h.notify).toHaveBeenCalledWith("@Lead sheet");
	});
	test("Open shows the file in the viewer panel: a PDF in a frame, an image, audio with its player, with download and link buttons", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: base() });
		expect(screen.queryByRole("dialog")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Open Lead sheet" }));
		const panel = screen.getByRole("dialog", { name: "Lead sheet" });
		expect(within(panel).getByTitle("Lead sheet")).toHaveAttribute("src", "https://store/chart");
		expect(within(panel).getByRole("link", { name: "Download Lead sheet" })).toHaveAttribute(
			"href",
			"/f/code-chart?download=1",
		);
		await user.click(within(panel).getByRole("button", { name: "Copy a link to Lead sheet" }));
		expect(h.shortenShareLink).toHaveBeenCalledWith(
			"https://www.stemshovel.com/f/code-chart",
			"other",
		);
		await user.click(screen.getByRole("button", { name: "Open band.jpg" }));
		expect(
			within(screen.getByRole("dialog", { name: "band.jpg" })).getByRole("img"),
		).toHaveAttribute("src", "https://store/photo");
		await openMenu(user, "Actions for idea.m4a");
		await user.click(screen.getByRole("button", { name: "Open" }));
		expect(screen.getByRole("dialog", { name: "idea.m4a" }).querySelector("audio")).toHaveAttribute(
			"src",
			"https://store/scrap",
		);
	});
});

describe("SongFilesPanel: uploading", () => {
	const picker = () => document.querySelector('input[type="file"]') as HTMLInputElement;
	const pick = async (files: File[]) => {
		const input = picker();
		Object.defineProperty(input, "files", { value: files, configurable: true });
		await fireEvent.change(input);
	};
	test("each picked file is reserved under the song by name and size, then uploaded; the list refreshes and the jobs clear", async () => {
		render(SongFilesPanel, { props: base() });
		let progress: ((p: number) => void) | undefined;
		h.uploadFile.mockImplementationOnce(
			async (_f: File, reserve: () => Promise<unknown>, onProgress) => {
				progress = onProgress;
				await reserve();
				onProgress?.(50);
				await tick();
				expect(screen.getByRole("list", { name: "Attachment uploads" })).toHaveTextContent(
					"a.pdf 50%b.png 0%",
				);
				expect(screen.getByText("Uploading…")).toBeInTheDocument();
				return { shareCode: "x", kind: "pdf" };
			},
		);
		await pick([new File(["abc"], "a.pdf"), new File(["defg"], "b.png")]);
		await vi.waitFor(() => expect(h.refreshAll).toHaveBeenCalledTimes(1));
		expect(progress).toBeDefined();
		expect(h.postJson.mock.calls.map((c) => c[1])).toEqual([
			{ songId: "song-1", filename: "a.pdf", sizeBytes: 3 },
			{ songId: "song-1", filename: "b.png", sizeBytes: 4 },
		]);
		expect(h.uploadFile).toHaveBeenCalledTimes(2);
		await tick();
		expect(screen.queryByRole("list", { name: "Attachment uploads" })).toBeNull();
		expect(screen.getByText("Upload Attachments")).toBeInTheDocument();
		expect(picker().value).toBe("");
	});
	test("a file over its kind's ceiling is refused on the spot and a refused upload keeps its message in the list", async () => {
		render(SongFilesPanel, { props: base() });
		h.uploadFile.mockRejectedValueOnce({ status: 409, body: { message: "Storage is full" } });
		const big = new File([""], "huge.txt");
		Object.defineProperty(big, "size", { value: FILE_MAX_BYTES.text + 1 });
		await pick([big, new File(["x"], "ok.pdf")]);
		await vi.waitFor(() => expect(h.refreshAll).toHaveBeenCalledTimes(1));
		await tick();
		const jobs = screen.getByRole("list", { name: "Attachment uploads" });
		expect(
			within(jobs)
				.getAllByRole("listitem")
				.map((li) => li.textContent?.replace(/\s+/g, " ").trim()),
		).toEqual(["huge.txt Over 2.0 MB for text files", "ok.pdf Storage is full"]);
		expect(h.uploadFile).toHaveBeenCalledTimes(1);
	});
	test("MusicXML goes to the Chart tab's flow, and only the room left under the song's limit is taken", async () => {
		const onnotation = vi.fn(async () => {});
		const many = Array.from({ length: MAX_FILES_PER_SONG - 1 }, (_, i) => file({ id: `f${i}` }));
		render(SongFilesPanel, { props: base({ files: many, onnotation }) });
		await pick([
			new File(["<xml/>"], "lead.musicxml"),
			new File(["a"], "one.pdf"),
			new File(["b"], "two.pdf"),
		]);
		expect(onnotation).toHaveBeenCalledWith([expect.objectContaining({ name: "lead.musicxml" })]);
		expect(h.notify).toHaveBeenCalledWith(
			`A song can have at most ${MAX_FILES_PER_SONG} attachments; the first 1 were taken`,
			{ kind: "error" },
		);
		await vi.waitFor(() => expect(h.refreshAll).toHaveBeenCalledTimes(1));
		expect(h.postJson).toHaveBeenCalledTimes(1);
		expect(h.postJson.mock.calls[0][1]).toMatchObject({ filename: "one.pdf" });
	});
	test("the picker is disabled once the song holds its limit", () => {
		const many = Array.from({ length: MAX_FILES_PER_SONG }, (_, i) => file({ id: `f${i}` }));
		render(SongFilesPanel, { props: base({ files: many }) });
		expect(picker()).toBeDisabled();
	});
});

describe("SongFilesPanel: the project view", () => {
	const songs = [
		{ id: "song-1", title: "Clocks", slug: "clocks" },
		{ id: "song-2", title: "Verbs", slug: "verbs" },
	];
	const props = (): Props =>
		base({
			songId: undefined,
			projectId: "proj-1",
			songTitle: "Badverbs",
			songs,
			songHref: (s: { slug: string }) => `/mmkk/projects/badverbs/${s.slug}`,
			files: [
				file({ id: "mine", filename: "mine.pdf", songId: "song-1", song: songs[0] }),
				file({ id: "loose", filename: "loose.pdf", songId: null, song: null }),
			],
		});
	test("tiles name their song with a link, or say they belong to the project; notation needs a song", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: props() });
		expect(within(tile("mine.pdf")).getByRole("link", { name: "Clocks" })).toHaveAttribute(
			"href",
			"/mmkk/projects/badverbs/clocks",
		);
		expect(tile("loose.pdf")).toHaveTextContent("the project");
		await openMenu(user, "Actions for loose.pdf");
		expect(menuItems()).toEqual([
			"Open",
			"Download",
			"Open in a new tab",
			"Edit",
			"Attach to a song…",
			"Remove",
		]);
		await user.keyboard("{Escape}");
		await openMenu(user, "Actions for mine.pdf");
		expect(menuItems()).toContain("Move to another song…");
	});
	test("Attach to a song… offers the project's songs; choosing one moves the file, choosing the project detaches it", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: props() });
		await openMenu(user, "Actions for loose.pdf");
		await user.click(screen.getByRole("button", { name: "Attach to a song…" }));
		const select = screen.getByRole("combobox", { name: "Attach loose.pdf to" });
		expect(
			within(select)
				.getAllByRole("option")
				.map((o) => o.textContent),
		).toEqual(["The project (no song)", "Clocks", "Verbs"]);
		await user.selectOptions(select, "song-2");
		expect(h.attachFile).toHaveBeenCalledWith({ id: "loose", songId: "song-2" });
		await tick();
		expect(h.notify).toHaveBeenCalledWith("loose.pdf is on “Verbs” now");
		expect(screen.queryByRole("combobox")).toBeNull();

		await openMenu(user, "Actions for mine.pdf");
		await user.click(screen.getByRole("button", { name: "Move to another song…" }));
		await user.selectOptions(screen.getByRole("combobox", { name: "Attach mine.pdf to" }), "");
		expect(h.attachFile).toHaveBeenCalledWith({ id: "mine", songId: null });
		await tick();
		expect(h.notify).toHaveBeenCalledWith("mine.pdf belongs to the project now");
	});
	test("choosing the song it is already on changes nothing, and Cancel closes the select", async () => {
		const user = userEvent.setup();
		render(SongFilesPanel, { props: props() });
		await openMenu(user, "Actions for mine.pdf");
		await user.click(screen.getByRole("button", { name: "Move to another song…" }));
		await user.selectOptions(
			screen.getByRole("combobox", { name: "Attach mine.pdf to" }),
			"song-1",
		);
		expect(h.attachFile).not.toHaveBeenCalled();
		await openMenu(user, "Actions for mine.pdf");
		await user.click(screen.getByRole("button", { name: "Move to another song…" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("combobox")).toBeNull();
	});
	test("uploads reserve under the project, and the picker never fills up", async () => {
		const many = Array.from({ length: MAX_FILES_PER_SONG + 5 }, (_, i) => file({ id: `f${i}` }));
		render(SongFilesPanel, { props: { ...props(), files: many } });
		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(input).not.toBeDisabled();
		Object.defineProperty(input, "files", {
			value: [new File(["x"], "a.pdf")],
			configurable: true,
		});
		await fireEvent.change(input);
		await vi.waitFor(() => expect(h.refreshAll).toHaveBeenCalledTimes(1));
		expect(h.postJson.mock.calls[0][1]).toEqual({
			projectId: "proj-1",
			filename: "a.pdf",
			sizeBytes: 1,
		});
	});
});
