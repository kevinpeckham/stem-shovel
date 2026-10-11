import { describe, expect, it } from "vite-plus/test";
import { keyLine, keySequence } from "./keyLine";

const key = (start: number, value: string) => ({ kind: "key" as const, start, value });

describe("keyLine", () => {
	it("names the starting key, then the others in order of appearance, each once", () => {
		const changes = [
			{ kind: "tempo" as const, start: 0, value: "120" },
			key(60, "A♭ major"),
			key(0, "C major"),
			key(90, "F major"),
			key(120, "C major"),
			key(150, "E♭ major"),
		];
		expect(keySequence(changes)).toEqual(["C major", "A♭ major", "F major", "E♭ major"]);
		expect(keyLine(changes)).toBe("C major (also A♭ major, F major, E♭ major)");
	});
	it("one key is itself; no key is nothing", () => {
		expect(keyLine([key(0, "D major")])).toBe("D major");
		expect(keyLine([{ kind: "tempo", start: 0, value: "90" }])).toBe("");
	});
});
