import { describe, expect, test } from "vite-plus/test";
import { shareTargetIds } from "./shareTargetIds";

describe("shareTargetIds", () => {
	const none = {
		songId: "",
		mixId: "",
		projectId: "",
		sessionId: "",
		recordingId: "",
		setListId: "",
	};
	test("one id set, the rest empty", () => {
		expect(shareTargetIds({ songId: "s", mixId: "m" })).toEqual({
			...none,
			songId: "s",
			mixId: "m",
		});
		expect(shareTargetIds({ songId: "s" })).toEqual({ ...none, songId: "s" });
		expect(shareTargetIds({ projectId: "p" })).toEqual({ ...none, projectId: "p" });
		expect(shareTargetIds({ sessionId: "x" })).toEqual({ ...none, sessionId: "x" });
		expect(shareTargetIds({ recordingId: "r" })).toEqual({ ...none, recordingId: "r" });
		expect(shareTargetIds({ setListId: "l" })).toEqual({ ...none, setListId: "l" });
	});
});
