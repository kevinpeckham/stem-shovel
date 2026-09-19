import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import ProjectPlayer from "./ProjectPlayer.svelte";

describe("ProjectPlayer", () => {
	test("with no mixes the play button is disabled and says why", () => {
		render(ProjectPlayer, { props: { songs: [{ id: "a", title: "One", mixUrl: null }] } });
		expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
		expect(screen.getByText(/Mixes appear here/)).toBeInTheDocument();
	});
	test("counts the songs that are ready to play", () => {
		render(ProjectPlayer, {
			props: {
				songs: [
					{ id: "a", title: "One", mixUrl: "https://blob/a.mp3" },
					{ id: "b", title: "Two", mixUrl: null },
					{ id: "c", title: "Three", mixUrl: "https://blob/c.mp3" },
				],
			},
		});
		expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
		expect(screen.getByText("2 songs ready to play")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
		// Nothing playing yet: the position slider waits.
		expect(screen.getByRole("slider", { name: "Position" })).toBeDisabled();
	});
});
