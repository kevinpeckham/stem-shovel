import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import ProjectPlayer from "./ProjectPlayer.svelte";

describe("ProjectPlayer", () => {
	test("with no mixes the play button is disabled and each tab says why", async () => {
		render(ProjectPlayer, { props: { songs: [{ id: "a", title: "One", mixUrl: null }] } });
		expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
		// No mix anywhere: the demos tab is the one open.
		expect(screen.getByRole("tab", { name: "Demos (0)" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByText(/Demos appear here/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("tab", { name: "Mixes (0)" }));
		expect(screen.getByText(/Mixes appear here/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
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
	test("opens on the mixes when a song has one, the demos otherwise", () => {
		const { unmount } = render(ProjectPlayer, {
			props: {
				songs: [{ id: "a", title: "One", mixUrl: "https://blob/a.mp3" }],
				demos: [{ id: "d1", title: "One · Demo", mixUrl: "https://blob/d1.m4a" }],
			},
		});
		expect(screen.getByRole("tab", { name: "Mixes (1)" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByText("1 song ready to play")).toBeInTheDocument();
		unmount();
		render(ProjectPlayer, {
			props: {
				songs: [{ id: "a", title: "One", mixUrl: null }],
				demos: [
					{ id: "d1", title: "One · Demo", mixUrl: "https://blob/d1.m4a" },
					{ id: "d2", title: "One · Take 2", mixUrl: "https://blob/d2.m4a" },
				],
			},
		});
		expect(screen.getByRole("tab", { name: "Demos (2)" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByText("2 demos ready to play")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
	});
});
