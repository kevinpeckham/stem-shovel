import { describe, expect, test } from "vite-plus/test";
import { dashboardTools } from "./dashboardTools";

describe("dashboardTools", () => {
	test("the Session Recorder for the account follows Dawn", () => {
		const labels = dashboardTools("the-band").map((t) => t.label);
		expect(labels.slice(3, 5)).toEqual(["Dawn Multitrack Studio", "Session Recorder"]);
		expect(dashboardTools("the-band")[4].href).toBe("/the-band/sessions/record");
		expect(labels).toHaveLength(8);
	});
	test("no account, no Session Recorder", () => {
		expect(dashboardTools(null).map((t) => t.label)).not.toContain("Session Recorder");
	});
});
