import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/** The empty player: "No stems yet." for everyone, the uploads for an editor. StemUploader is a stand-in that keeps its props. */
const h = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("#lib/components/StemUploader.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		h.props = props;
		return { retryFailed: async () => {} };
	},
}));

const { default: SongEmptyPlayer } = await import("./SongEmptyPlayer.svelte");
const { StemUploads } = await import("#lib/state/stemUploads.svelte.js");
type Demos = import("#lib/state/demoUploads.svelte.js").DemoUploads;

function setup({ canEdit = true, busy = false } = {}) {
	h.props = null;
	const uploads = new StemUploads();
	const demos = { busy, upload: vi.fn() };
	const onuploaded = vi.fn();
	const onanalysis = vi.fn();
	render(SongEmptyPlayer, {
		songId: "s1",
		stems: [{ durationSeconds: 1, channels: 2 }],
		canEdit,
		uploads,
		demos: demos as unknown as Demos,
		onuploaded,
		onanalysis,
	});
	return { uploads, demos, onuploaded };
}

describe("SongEmptyPlayer", () => {
	test("a visitor sees only the empty box", () => {
		setup({ canEdit: false });
		expect(screen.getByText("No stems yet.")).toBeInTheDocument();
		expect(screen.queryByText("Upload a demo")).toBeNull();
		expect(h.props).toBeNull();
	});

	test("an editor: the uploader for this song, a demo upload and the recorder link", () => {
		const { onuploaded } = setup();
		expect(h.props?.songId).toBe("s1");
		expect(h.props?.stemCount).toBe(1);
		expect(h.props?.decodedBytes).toBeGreaterThan(0);
		expect(h.props?.onuploaded).toBe(onuploaded);
		expect(screen.getByRole("link", { name: /Record a demo/ })).toHaveAttribute(
			"href",
			"/idea-recorder?song=s1",
		);
	});

	test("picking a demo uploads it", async () => {
		const { demos } = setup();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("no demo input");
		await fireEvent.change(input);
		expect(demos.upload).toHaveBeenCalledWith(input);
	});

	test("a demo on its way: Uploading…", () => {
		setup({ busy: true });
		expect(screen.getByText("Uploading…")).toBeInTheDocument();
	});
});
