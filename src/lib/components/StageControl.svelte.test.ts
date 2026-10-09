import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";

/** The stage control (docs/mixes.md, "Phase 2"): names the stage in force and where it comes from, and lets a member set it. */
const setSongStage = fakeRemoteForm();
vi.mock("#lib/remote/songs.remote.js", () => ({ setSongStage }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: StageControl } = await import("./StageControl.svelte");
const id = "V1StGXR8_Z5jdHi6B-myT";

describe("StageControl", () => {
	test("read from the song: says so, and Save waits for a change", async () => {
		render(StageControl, { props: { id, stage: null, effective: "mixing", canChange: true } });
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/Stage: Mixing/);
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/from what the song holds/);
		const select = screen.getByRole("combobox", { name: "Stage" });
		expect(select).toHaveValue("");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await fireEvent.change(select, { target: { value: "finished" } });
		expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
	});
	test("set by hand: the stage without the note; a listener who may not change it sees no form", () => {
		const { unmount } = render(StageControl, {
			props: { id, stage: "arranging", effective: "arranging", canChange: true },
		});
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Stage: Arranging");
		expect(screen.getByRole("heading", { level: 3 })).not.toHaveTextContent("from what");
		unmount();
		render(StageControl, { props: { id, stage: null, effective: "writing", canChange: false } });
		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.getByText(/Songwriting/)).toBeInTheDocument();
	});
});
