import { describe, expect, test } from "vite-plus/test";
import { activityText } from "./activityText";

describe("activityText", () => {
	test("names the person and the thing per kind", () => {
		expect(activityText({ kind: "stem", who: "Pat", label: "Bass" })).toBe(
			"Pat added the stem Bass",
		);
		expect(activityText({ kind: "demo", who: "Pat", label: "Rough" })).toBe(
			"Pat added the demo Rough",
		);
		expect(activityText({ kind: "mix", who: "Sam", label: "v2 Loud" })).toBe(
			"Sam added the mix v2 Loud",
		);
		expect(activityText({ kind: "doc", who: "Sam", label: "chart" })).toBe("Sam edited the chart");
		expect(activityText({ kind: "chat", who: "Sam", label: "" })).toBe("Sam wrote in the chat");
		expect(activityText({ kind: "session-chat", who: "Sam", label: "" })).toBe(
			"Sam wrote in the chat",
		);
		expect(activityText({ kind: "comment", who: "Sam", label: "" })).toBe("Sam commented");
		expect(activityText({ kind: "session-comment", who: "Sam", label: "" })).toBe("Sam commented");
	});
	test("a row without a person, and the kinds that are news on their own", () => {
		expect(activityText({ kind: "stem", who: null, label: "Bass" })).toBe(
			"Someone added the stem Bass",
		);
		expect(activityText({ kind: "session-recording", who: null, label: "Set 1" })).toBe(
			"Recording added: Set 1",
		);
		expect(activityText({ kind: "session-recording", who: null, label: "" })).toBe(
			"Recording added",
		);
		expect(activityText({ kind: "song", who: null, label: "Intro" })).toBe("New song");
		expect(activityText({ kind: "project", who: null, label: "Album" })).toBe("New project");
	});
});
