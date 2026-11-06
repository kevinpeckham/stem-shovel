import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import PlayerTips from "./PlayerTips.svelte";

/** The player's tips under the rows: the keys and the click for everyone, the comment gesture for someone who may comment. */
describe("PlayerTips", () => {
	test("the keys and the click; no comment line for a visitor", () => {
		render(PlayerTips, { canComment: false });
		const tips = screen.getByLabelText("Player tips");
		expect(tips).toHaveTextContent("Space play / pause");
		expect(tips).toHaveTextContent("Home to the start");
		expect(tips).toHaveTextContent("click a waveform to jump there");
		expect(tips).not.toHaveTextContent("leave a comment");
	});

	test("the comment gesture for someone who may comment", () => {
		render(PlayerTips, { canComment: true });
		expect(screen.getByLabelText("Player tips")).toHaveTextContent(
			"⌘-click, Ctrl-click or right-click a waveform to leave a comment there",
		);
	});
});
