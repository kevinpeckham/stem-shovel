import { describe, expect, it } from "vite-plus/test";
import { coveredClips } from "./coveredClips";

const clip = (
	id: string,
	trackId: string,
	start: number,
	duration: number,
	alternates?: string[],
) => ({
	id,
	trackId,
	start,
	duration,
	sourceId: `src-${id}`,
	alternates,
});

describe("coveredClips", () => {
	it("covers a clip of the same span on the same track and inherits its source", () => {
		const clips = [clip("a", "t1", 0, 2), clip("b", "t2", 0, 2)];
		const r = coveredClips(clips, { trackId: "t1", start: 0, duration: 2 });
		expect(r.covered.map((c) => c.id)).toEqual(["a"]);
		expect(r.alternates).toEqual(["src-a"]);
	});
	it("leaves a clip that pokes out of the take alone", () => {
		const clips = [clip("a", "t1", 1, 3)];
		expect(coveredClips(clips, { trackId: "t1", start: 0, duration: 2 }).covered).toEqual([]);
		expect(coveredClips(clips, { trackId: "t1", start: 2, duration: 4 }).covered).toEqual([]);
	});
	it("covers several clips inside the take and chains their alternates without repeats", () => {
		const clips = [clip("a", "t1", 0, 1, ["old-1"]), clip("b", "t1", 1, 1, ["old-1", "old-2"])];
		const r = coveredClips(clips, { trackId: "t1", start: 0, duration: 2 });
		expect(r.covered.map((c) => c.id)).toEqual(["a", "b"]);
		expect(r.alternates).toEqual(["src-a", "old-1", "src-b", "old-2"]);
	});
	it("tolerates a few milliseconds at the edges", () => {
		const clips = [clip("a", "t1", 0, 2.003)];
		expect(coveredClips(clips, { trackId: "t1", start: 0.002, duration: 2 }).covered).toHaveLength(
			1,
		);
	});
	it("caps the alternates", () => {
		const clips = [
			clip(
				"a",
				"t1",
				0,
				1,
				Array.from({ length: 40 }, (_, i) => `alt-${i}`),
			),
		];
		expect(
			coveredClips(clips, { trackId: "t1", start: 0, duration: 1 }, 5).alternates,
		).toHaveLength(5);
	});
});
