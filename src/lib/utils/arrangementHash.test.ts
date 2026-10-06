import { describe, expect, test } from "vite-plus/test";
import { arrangementHash } from "./arrangementHash";

describe("arrangementHash", () => {
	test("sixteen hex characters, stable for equal values", () => {
		const a = arrangementHash({ version: 1, tracks: [{ id: "t1", gain: 1 }], clips: [] });
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(arrangementHash({ version: 1, tracks: [{ id: "t1", gain: 1 }], clips: [] })).toBe(a);
	});
	test("key order does not matter; values do", () => {
		const a = arrangementHash({ bpm: 120, gridOn: true, tracks: [{ id: "a", pan: 0 }] });
		const b = arrangementHash({ tracks: [{ pan: 0, id: "a" }], gridOn: true, bpm: 120 });
		expect(b).toBe(a);
		expect(arrangementHash({ bpm: 121, gridOn: true, tracks: [{ id: "a", pan: 0 }] })).not.toBe(a);
	});
	test("an undefined member is the same as a missing one; array order counts", () => {
		expect(arrangementHash({ a: 1, b: undefined })).toBe(arrangementHash({ a: 1 }));
		expect(arrangementHash([1, 2])).not.toBe(arrangementHash([2, 1]));
		expect(arrangementHash(null)).toBe(arrangementHash(undefined));
	});
});
