import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/** The stems not ready: each with how far its file got, and the upload and remove controls for an editor. */
const forms = vi.hoisted(() => {
	const form = {
		enhance: () => ({}),
		pending: 0,
		fields: { id: { as: (type: string, value: string) => ({ name: "id", type, value }) } },
	};
	return {
		deleteStem: { for: () => form },
		renameStem: vi.fn(),
		reorderStems: vi.fn(),
		setSongVersion: vi.fn(),
		setStemTint: vi.fn(),
	};
});
vi.mock("#lib/remote/songs.remote.js", () => forms);
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: PendingStems } = await import("./PendingStems.svelte");
const { StemActions } = await import("#lib/state/stemActions.svelte.js");

const pending = [
	{ id: "a", label: "Bass", filename: "bass.wav" },
	{ id: "b", label: "Drums", filename: "drums.wav" },
];

function setup(canEdit = true) {
	const actions = new StemActions({
		song: () => ({ id: "song1", version: "1.0.0" }),
		onsaved: vi.fn(),
	});
	actions.replacing = { b: { percent: 37.6, stage: "uploading" } };
	const replace = vi.spyOn(actions, "replace").mockResolvedValue();
	render(PendingStems, { pending, actions, canEdit });
	return { replace };
}

describe("PendingStems", () => {
	test("nothing pending: nothing", () => {
		render(PendingStems, {
			pending: [],
			actions: new StemActions({ song: () => ({ id: "s", version: "1.0.0" }), onsaved: vi.fn() }),
			canEdit: true,
		});
		expect(screen.queryByLabelText("Stems not ready")).toBeNull();
	});

	test("each stem: interrupted, or its replacement's progress", () => {
		setup();
		expect(screen.getByLabelText("Stems not ready")).toBeInTheDocument();
		expect(
			screen.getByText(/bass\.wav · not ready — the upload was interrupted/),
		).toBeInTheDocument();
		expect(screen.getByText(/drums\.wav · 38%/)).toBeInTheDocument();
	});

	test("an editor gets Upload file and Remove; the one on its way cannot pick again", () => {
		setup();
		expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
		const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
		expect(inputs).toHaveLength(2);
		expect(inputs[0].disabled).toBe(false);
		expect(inputs[1].disabled).toBe(true);
	});

	test("a visitor sees the list only", () => {
		setup(false);
		expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
		expect(screen.queryByText("Upload file")).toBeNull();
	});
});
