import { describe, expect, test } from "vite-plus/test";
import { sessionDeviceOf } from "./sessionDeviceOf";

describe("sessionDeviceOf", () => {
	test("one of the device keys, anything else unset", () => {
		expect(sessionDeviceOf("phone")).toBe("phone");
		expect(sessionDeviceOf("field-rig")).toBe("field-rig");
		expect(sessionDeviceOf("Phone")).toBe("");
		expect(sessionDeviceOf("")).toBe("");
		expect(sessionDeviceOf(undefined)).toBe("");
		expect(sessionDeviceOf(3)).toBe("");
	});
});
