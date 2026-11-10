import { describe, expect, test } from "vite-plus/test";
import { activityNoun } from "./activityNoun";

describe("activityNoun", () => {
	test("names what a removal deletes per kind", () => {
		expect(activityNoun({ kind: "stem", label: "Bass" })).toBe("stem");
		expect(activityNoun({ kind: "mix", label: "v2 Loud" })).toBe("mix");
		expect(activityNoun({ kind: "doc", label: "chart" })).toBe("version of the chart");
		expect(activityNoun({ kind: "session-recording", label: "Take one" })).toBe("recording");
		expect(activityNoun({ kind: "chat", label: "" })).toBe("chat message");
		expect(activityNoun({ kind: "session-chat", label: "" })).toBe("chat message");
		expect(activityNoun({ kind: "session-comment", label: "" })).toBe("comment");
		expect(activityNoun({ kind: "project", label: "Demos" })).toBe("project");
	});
});
