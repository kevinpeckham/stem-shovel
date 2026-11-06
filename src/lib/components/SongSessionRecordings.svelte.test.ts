import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import SongSessionRecordings from "./SongSessionRecordings.svelte";

/** The Demos view's "From sessions": each recording links to the Sessions page. */
const recordings = [
	{ id: "r1", title: "Take 3", source: "Zoom H5", session: "Rehearsal", recordedOn: "2026-10-01" },
	{ id: "r2", title: "Live", source: "", session: "The Bar", recordedOn: "2026-10-05" },
];

describe("SongSessionRecordings", () => {
	test("none: nothing", () => {
		render(SongSessionRecordings, { recordings: [], accountSlug: "band" });
		expect(screen.queryByLabelText("Session recordings of this song")).toBeNull();
	});

	test("the count, and each recording's link", () => {
		render(SongSessionRecordings, { recordings, accountSlug: "band" });
		expect(screen.getByText("From sessions (2)")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Take 3" })).toHaveAttribute(
			"href",
			"/band/sessions?recording=r1",
		);
		expect(screen.getByText("Zoom H5")).toBeInTheDocument();
		expect(screen.getByText(/^The Bar · /)).toBeInTheDocument();
	});
});
