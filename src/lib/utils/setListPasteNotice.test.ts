import { describe, expect, it } from "vite-plus/test";
import { setListPasteNotice } from "./setListPasteNotice";

describe("setListPasteNotice", () => {
	it("counts songs alone when every line matched", () => {
		expect(setListPasteNotice(4, 4)).toBe("4 songs added");
		expect(setListPasteNotice(1, 1)).toBe("1 song added");
	});
	it("says text when nothing matched", () => {
		expect(setListPasteNotice(3, 0)).toBe("3 rows added as text");
		expect(setListPasteNotice(1, 0)).toBe("1 row added as text");
	});
	it("tells the split otherwise", () => {
		expect(setListPasteNotice(3, 2)).toBe("3 rows added, 2 of them songs");
		expect(setListPasteNotice(2, 1)).toBe("2 rows added, 1 of them a song");
	});
});
