import { render } from "svelte/server";
import { describe, expect, it } from "vite-plus/test";
import type { StemManifest } from "#lib/audio/types.js";
import StemPlayer from "./StemPlayer.svelte";

/**
 * The server's render of the player (the unit project runs in Node, so the
 * component compiles for the server): the rows and the transport come from
 * the manifest alone, before any engine load, with no AudioContext, window
 * or storage to lean on.
 */
const manifest: StemManifest = {
	title: "Song",
	stems: [
		{
			id: "drums",
			label: "Drums",
			url: "https://blob/drums.m4a",
			duration: 10,
			peaks: [0.2, 0.6, 0.4],
		},
		{
			id: "bass",
			label: "Bass",
			url: "https://blob/bass.m4a",
			duration: 12,
			peaks: [0.1, 0.3, 0.5],
		},
	],
};

describe("StemPlayer on the server", () => {
	it("renders a row per stem with its label, and the transport", () => {
		const { body } = render(StemPlayer, { props: { manifest } });
		expect(body.match(/data-stem-row/g)).toHaveLength(2);
		expect(body).toContain("Drums");
		expect(body).toContain("Bass");
		expect(body).toMatch(/aria-label="Play"/);
	});
});
