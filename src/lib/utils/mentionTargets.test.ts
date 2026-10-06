import { describe, expect, it } from "vite-plus/test";
import { mentionTargets } from "./mentionTargets";

describe("mentionTargets", () => {
	it("names ready files and notation by title or filename, demos by label", () => {
		expect(
			mentionTargets({
				files: [
					{ status: "ready", title: "Chart", filename: "chart.pdf", shareCode: "c1" },
					{ status: "ready", title: "", filename: "photo.jpg", shareCode: "c2" },
					{ status: "uploading", title: "Soon", filename: "soon.pdf", shareCode: "c3" },
				],
				notation: [{ status: "ready", title: "Score", filename: "score.mxl", shareCode: "n1" }],
				demos: [{ id: "d1", label: "Rough mix" }],
			}),
		).toEqual([
			{ label: "Chart", href: "/f/c1" },
			{ label: "photo.jpg", href: "/f/c2" },
			{ label: "Score", href: "/f/n1" },
			{ label: "Rough mix", href: "#demo-d1" },
		]);
	});
});
