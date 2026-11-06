import { describe, expect, test } from "vite-plus/test";
import { chordsReadNotice } from "./chordsReadNotice";

describe("chordsReadNotice", () => {
	test("none, one, a batch with more waiting", () => {
		expect(chordsReadNotice(0, 0)).toBe("Every song is read");
		expect(chordsReadNotice(1, 0)).toBe("Reading 1 song");
		expect(chordsReadNotice(40, 12)).toBe("Reading 40 songs, 12 more after these");
	});
});
