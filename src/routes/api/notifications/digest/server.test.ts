import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../tests/helpers/fakeServerModules";
import { asSignedOut } from "../../../../../tests/helpers/fakeRequestEvent";
import {
	calendar,
	notifications,
	resetRemoteMocks,
	shortLinks,
} from "../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../tests/helpers/fakeApiEvent";

/**
 * The daily cron: anyone may call it (due-ness gates every digest), the
 * digests go out, then the expired short links are swept; a failed sweep is
 * logged and the digests are still reported; last, the day-before reminders
 * of tomorrow (UTC) go out.
 */
const { GET } = await import("./+server");

const get = () =>
	callRoute(GET, asSignedOut(), new Request("http://localhost/api/notifications/digest"));

beforeEach(() => {
	resetRemoteMocks();
	notifications.sendDigests.mockResolvedValue({ sent: 3 });
	shortLinks.purgeExpiredShortLinks.mockResolvedValue(2);
	calendar.sendEventReminders.mockResolvedValue(4);
});

describe("GET /api/notifications/digest", () => {
	it("sends the digests and sweeps the short links for an anonymous caller, uncached", async () => {
		const res = await get();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, sent: 3, purged: 2, reminded: 4 });
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(notifications.sendDigests).toHaveBeenCalledTimes(1);
		expect(notifications.sendDigests).toHaveBeenCalledWith();
		expect(shortLinks.purgeExpiredShortLinks).toHaveBeenCalledTimes(1);
		expect(shortLinks.purgeExpiredShortLinks).toHaveBeenCalledWith();
	});
	it("a failed purge is logged and the digests are still reported, with nothing purged", async () => {
		const failure = new Error("database busy");
		shortLinks.purgeExpiredShortLinks.mockRejectedValue(failure);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await get();
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true, sent: 3, purged: 0, reminded: 4 });
			expect(log).toHaveBeenCalledWith("[short-links] purge failed:", failure);
		} finally {
			log.mockRestore();
		}
	});
	it("a failed digest run is not swallowed: the cron sees the error and no purge runs", async () => {
		notifications.sendDigests.mockRejectedValue(new Error("mail down"));
		await expect(get()).rejects.toThrow("mail down");
		expect(shortLinks.purgeExpiredShortLinks).not.toHaveBeenCalled();
		expect(calendar.sendEventReminders).not.toHaveBeenCalled();
	});
	it("reminds about tomorrow's events, tomorrow being the UTC date plus one", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(Date.UTC(2026, 9, 31, 13, 0, 0));
			await get();
			expect(calendar.sendEventReminders).toHaveBeenCalledWith("2026-11-01");
		} finally {
			vi.useRealTimers();
		}
	});
});
