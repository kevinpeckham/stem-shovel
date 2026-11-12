import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";
import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The one popover that changes a demo's notes: opened on a demo it shows
 * that demo's saved notes; Save submits the form, closes and says so;
 * Cancel closes without a word. The Demos view opens it from a row's
 * Edit notes… on that row's demo.
 */
const h = vi.hoisted(() => ({ notify: vi.fn(), saveAs: vi.fn() }));
vi.mock("#lib/remote/songs.remote.js", () => ({ setDemoNotes: fakeRemoteForm({ saved: true }) }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/upload.js", () => ({ saveAs: h.saveAs }));

const { default: DemoNotesEditor } = await import("./DemoNotesEditor.svelte");
const { default: DemoPanel } = await import("./DemoPanel.svelte");
const { default: DemoNotesBlock } = await import("./DemoNotesBlock.svelte");
const remote = await import("#lib/remote/songs.remote.js");
const { DEMO_NOTES_MAX } = await import("#lib/constants/demoFormats.js");
const submit = () =>
	(remote.setDemoNotes as unknown as { submit: ReturnType<typeof vi.fn> }).submit;

type Editor = { open: (d: { id: string; label: string; notes: string }) => Promise<void> };
const popover = () => screen.getByRole("dialog", { name: /^Notes on / });

beforeAll(() => installFakePopover());
beforeEach(() => vi.clearAllMocks());

describe("DemoNotesEditor", () => {
	test("opens on a demo with its saved notes in the field, focused", async () => {
		const { component } = render(DemoNotesEditor);
		expect(screen.queryByRole("dialog")).toBeNull();
		await (component as unknown as Editor).open({
			id: "d1",
			label: "Take one",
			notes: "Rough take\nlisten for the bass",
		});
		const d = screen.getByRole("dialog", { name: "Notes on Take one" });
		const field = within(d).getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement;
		expect(field.value).toBe("Rough take\nlisten for the bass");
		expect(field.getAttribute("maxlength")).toBe(String(DEMO_NOTES_MAX));
		expect(document.activeElement).toBe(field);
	});

	test("Save submits, closes and says the notes were saved", async () => {
		const { component } = render(DemoNotesEditor);
		await (component as unknown as Editor).open({ id: "d1", label: "Take one", notes: "" });
		await fireEvent.submit(within(popover()).getByRole("form", { name: "Demo notes" }));
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Notes saved"));
		expect(submit()).toHaveBeenCalledOnce();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("Cancel closes without saving", async () => {
		const { component } = render(DemoNotesEditor);
		await (component as unknown as Editor).open({ id: "d1", label: "Take one", notes: "x" });
		await fireEvent.click(within(popover()).getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(submit()).not.toHaveBeenCalled();
		expect(h.notify).not.toHaveBeenCalled();
	});

	test("the Demos view's Edit notes… asks the page for the popover on that row's demo", async () => {
		const oneditnotes = vi.fn();
		const take = (id: string, notes: string) => ({
			id,
			label: `Take ${id}`,
			url: `u${id}`,
			playbackUrl: null,
			filename: `${id}.m4a`,
			sizeBytes: 1,
			notes,
		});
		render(DemoPanel, { demos: [take("1", ""), take("2", "Second")], canEdit: true, oneditnotes });
		const row = screen.getByText("Take 2").closest("li")!;
		await fireEvent.click(within(row).getByRole("menuitem", { name: /Edit notes…/, hidden: true }));
		expect(oneditnotes).toHaveBeenCalledWith(expect.objectContaining({ id: "2", notes: "Second" }));
		const first = screen.getByText("Take 1").closest("li")!;
		expect(within(first).getByRole("menuitem", { name: /Add notes…/, hidden: true })).toBeTruthy();
	});
});

describe("DemoNotesBlock (the demo's page)", () => {
	const demo = (notes: string) => ({ id: "d1", label: "Take one", notes });

	test("a viewer sees the notes as text, and nothing at all without notes", () => {
		const { unmount } = render(DemoNotesBlock, { demo: demo("Rough\ntake"), canEdit: false });
		expect(screen.getByRole("region", { name: "Notes" }).querySelector("p")?.textContent).toBe(
			"Rough\ntake",
		);
		expect(screen.queryByRole("button")).toBeNull();
		unmount();
		const { container } = render(DemoNotesBlock, { demo: demo(""), canEdit: false });
		expect(container.textContent?.trim()).toBe("");
	});

	test("an editor gets Add notes without notes, Edit notes with some, which opens the popover prefilled", async () => {
		const { unmount } = render(DemoNotesBlock, { demo: demo(""), canEdit: true });
		expect(screen.getByRole("button", { name: "Add notes" })).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Notes" })).toBeNull();
		unmount();
		render(DemoNotesBlock, { demo: demo("Rough take"), canEdit: true });
		await fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
		const field = await vi.waitFor(
			() => within(popover()).getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement,
		);
		expect(field.value).toBe("Rough take");
	});
});
