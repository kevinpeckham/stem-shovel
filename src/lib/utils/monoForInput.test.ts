import { describe, expect, it } from "vite-plus/test";
import { monoForInput } from "./monoForInput";

describe("monoForInput", () => {
	const left = { source: "line", channel: "left" } as const;
	const stereo = { source: "line", channel: "stereo" } as const;
	it("makes an empty armed track mono for a one-channel input, and stereo again for both", () => {
		expect(monoForInput({ armed: true, input: left }, false)).toBe(true);
		expect(monoForInput({ armed: true, input: left, mono: true }, false)).toBeNull();
		expect(monoForInput({ armed: true, input: stereo, mono: true }, false)).toBe(false);
		expect(monoForInput({ armed: true, input: stereo }, false)).toBeNull();
	});
	it("leaves a track alone when it is not armed, has no input, holds clips or is a MIDI track", () => {
		expect(monoForInput({ armed: false, input: left }, false)).toBeNull();
		expect(monoForInput({ armed: true, input: null }, false)).toBeNull();
		expect(monoForInput({ armed: true, input: left }, true)).toBeNull();
		expect(monoForInput({ kind: "midi", armed: true, input: left }, false)).toBeNull();
	});
});
