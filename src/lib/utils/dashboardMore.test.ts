import { describe, expect, it } from "vite-plus/test";
import { DASHBOARD_MORE } from "#lib/constants/dashboardLinks.js";
import { dashboardMore } from "./dashboardMore";

describe("dashboardMore", () => {
	it("adds the current account's settings right after the inbox", () => {
		const labels = dashboardMore("mmkk").map((m) => m.label);
		expect(labels.slice(0, 4)).toEqual(["Inbox", "Account settings", "Notifications", "Links"]);
		expect(dashboardMore("mmkk")[1]).toEqual({ label: "Account settings", href: "/mmkk/settings" });
		expect(dashboardMore("mmkk")).toHaveLength(DASHBOARD_MORE.length + 1);
	});

	it("leaves them out without an account", () => {
		expect(dashboardMore(null)).toBe(DASHBOARD_MORE);
	});
});
