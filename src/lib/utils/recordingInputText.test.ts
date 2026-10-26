import { describe, expect, test } from "vite-plus/test";
import { recordingInputText } from "./recordingInputText";

describe("recordingInputText", () => {
	test("the device's label and the name together, either alone, or nothing", () => {
		expect(recordingInputText("phone", "Kevin's phone")).toBe("Phone · Kevin's phone");
		expect(recordingInputText("soundboard", "")).toBe("Soundboard");
		expect(recordingInputText("", "Room mic")).toBe("Room mic");
		expect(recordingInputText("", "  ")).toBe("");
		expect(recordingInputText(null, "")).toBe("");
	});
});
