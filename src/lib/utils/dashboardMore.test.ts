import { describe, expect, it } from "vite-plus/test";
import { DASHBOARD_MORE } from "#lib/constants/dashboardLinks.js";
import { dashboardMore } from "./dashboardMore";

describe("dashboardMore", () => {
	it("adds the current account's settings right after the inbox", () => {
		const labels = dashboardMore("mmkk").map((m) => m.label);
		expect(labels.slice(0, 4)).toEqual([
			"Inbox",
			"Account settings",
			"Create new account",
			"Notifications",
		]);
		expect(dashboardMore("mmkk")[1]).toEqual({ label: "Account settings", href: "/mmkk/settings" });
		expect(dashboardMore("mmkk")[2]).toEqual({
			label: "Create new account",
			href: "/accounts?new=1",
		});
		expect(dashboardMore("mmkk")).toHaveLength(DASHBOARD_MORE.length + 1);
	});

	it("leaves them out without an account", () => {
		expect(dashboardMore(null)).toBe(DASHBOARD_MORE);
		expect(
			dashboardMore(null)
				.map((m) => m.label)
				.slice(0, 3),
		).toEqual(["Inbox", "Create new account", "Notifications"]);
	});
});
