import { describe, expect, test } from "vite-plus/test";
import { labelFromFilename } from "./labelFromFilename";
import { slugify } from "./slugify";

describe("slugify", () => {
	test("lowercases, hyphenates, strips diacritics and edges", () => {
		expect(slugify("My Song (v2)")).toBe("my-song-v2");
		expect(slugify("  Café — Été  ")).toBe("cafe-ete");
		expect(slugify("---")).toBe("");
	});
	test("caps at 64 characters", () => {
		expect(slugify("a".repeat(100))).toHaveLength(64);
	});
});

describe("labelFromFilename", () => {
	test("drops the extension and any path", () => {
		expect(labelFromFilename("Bass DI.wav")).toBe("Bass DI");
		expect(labelFromFilename("takes/keys.final.mp3")).toBe("keys.final");
		expect(labelFromFilename("C:\\stems\\drums.flac")).toBe("drums");
	});
	test("keeps a name that is only an extension", () => {
		expect(labelFromFilename(".wav")).toBe(".wav");
	});
});
