import { describe, expect, test } from "vite-plus/test";
import { chartRehearsalLetters } from "./chartRehearsalLetters.js";

describe("chartRehearsalLetters", () => {
	test("a chart with its own marks is not lettered again; one without is", () => {
		expect(
			chartRehearsalLetters(
				"key: A, time: 4/4\n\n## Chorus\n| @A | N.C. | / |\n\n## Break\n| @B | Bm7 |",
			),
		).toBe(false);
		expect(
			chartRehearsalLetters("key: A, time: 4/4\n\n## Chorus\n| N.C. | / |\n\n## Break\n| Bm7 |"),
		).toBe(true);
		expect(chartRehearsalLetters("")).toBe(true);
	});
});
