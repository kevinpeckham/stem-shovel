import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The step between picking demo files and uploading them: a pick that
 * passed the checks opens the popover with each file and a notes field,
 * focused on the first; Upload sends each file with its notes, Cancel and
 * Escape drop the pick.
 */
const uploadDemoFile = vi.hoisted(() =>
	vi.fn(async (_file: File, reserve: () => Promise<unknown>) => {
		await reserve();
	}),
);
const postJson = vi.hoisted(() => vi.fn(async () => ({ demoId: "d1", pathname: "p" })));
vi.mock("#lib/upload.js", () => ({ uploadDemoFile, postJson }));
vi.mock("#lib/remote/songs.remote.js", () => ({ removeDemoById: vi.fn() }));

const { default: DemoUploadNotes } = await import("./DemoUploadNotes.svelte");
const { DemoUploads } = await import("#lib/state/demoUploads.svelte.js");
const { DEMO_NOTES_MAX } = await import("#lib/constants/demoFormats.js");

function file(name: string, size = 2048) {
	const f = new File(["x"], name);
	Object.defineProperty(f, "size", { value: size });
	return f;
}
function setup() {
	const onuploaded = vi.fn(async () => {});
	const demos = new DemoUploads({ song: () => ({ id: "song1", demos: [] }), onuploaded });
	render(DemoUploadNotes, { demos });
	const pick = (...names: string[]) => {
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: names.map((n) => file(n)) });
		demos.upload(input);
		flushSync();
	};
	return { demos, onuploaded, pick };
}
const dialog = () => screen.getByRole("dialog", { name: /Upload demo/ });

beforeAll(() => installFakePopover());
beforeEach(() => {
	uploadDemoFile.mockClear();
	postJson.mockClear();
});

describe("DemoUploadNotes", () => {
	test("closed until a pick passes the checks; then lists each file with a notes field, the first focused", () => {
		const { pick } = setup();
		expect(screen.queryByRole("dialog")).toBeNull();
		pick("memo.m4a", "take two.mp3");
		const d = screen.getByRole("dialog", { name: "Upload demos" });
		expect(within(d).getByText("memo.m4a")).toBeTruthy();
		expect(within(d).getByText("take two.mp3")).toBeTruthy();
		expect(within(d).getAllByText("2 KB").length).toBe(2);
		const fields = within(d).getAllByRole("textbox", { name: "Notes" });
		expect(fields).toHaveLength(2);
		expect(fields[0].getAttribute("maxlength")).toBe(String(DEMO_NOTES_MAX));
		expect(document.activeElement).toBe(fields[0]);
	});

	test("Upload sends each file with its own notes, and closes", async () => {
		const { pick, onuploaded } = setup();
		pick("memo.m4a", "take two.mp3");
		const fields = within(dialog()).getAllByRole("textbox", { name: "Notes" });
		await fireEvent.input(fields[0], { target: { value: "The bridge idea\nlisten at 1:20" } });
		await fireEvent.click(within(dialog()).getByRole("button", { name: "Upload" }));
		await vi.waitFor(() => expect(onuploaded).toHaveBeenCalledOnce());
		expect(postJson.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
			{
				songId: "song1",
				filename: "memo.m4a",
				sizeBytes: 2048,
				notes: "The bridge idea\nlisten at 1:20",
			},
			{ songId: "song1", filename: "take two.mp3", sizeBytes: 2048, notes: "" },
		]);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("Cancel drops the pick and uploads nothing", async () => {
		const { pick, demos } = setup();
		pick("memo.m4a");
		await fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
		expect(demos.pending).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});

	test("Escape cancels the pick", async () => {
		const { pick, demos } = setup();
		pick("memo.m4a");
		await fireEvent.keyDown(document, { key: "Escape" });
		expect(demos.pending).toBeNull();
		expect(uploadDemoFile).not.toHaveBeenCalled();
	});
});
