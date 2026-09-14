import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { NotificationsStore } from "./notifications.svelte";

describe("NotificationsStore", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("a success notice evaporates after its timeout", () => {
		const store = new NotificationsStore();
		store.notify("Song settings saved");
		expect(store.items).toHaveLength(1);
		expect(store.items[0]).toMatchObject({
			message: "Song settings saved",
			kind: "success",
			timeout: 4000,
		});
		vi.advanceTimersByTime(3999);
		expect(store.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(store.items).toHaveLength(0);
	});

	test("errors stay until dismissed", () => {
		const store = new NotificationsStore();
		const id = store.notify("Upload failed", { kind: "error" });
		vi.advanceTimersByTime(60_000);
		expect(store.items).toHaveLength(1);
		store.dismiss(id);
		expect(store.items).toHaveLength(0);
	});

	test("the same id replaces instead of stacking, and restarts the clock", () => {
		const store = new NotificationsStore();
		store.notify("Saving…", { id: "save", kind: "info" });
		vi.advanceTimersByTime(5000);
		store.notify("Saved", { id: "save" });
		expect(store.items).toHaveLength(1);
		expect(store.items[0].message).toBe("Saved");
		vi.advanceTimersByTime(3000);
		expect(store.items).toHaveLength(1);
		vi.advanceTimersByTime(1000);
		expect(store.items).toHaveLength(0);
	});

	test("sync keeps a keyed banner present while its condition holds", () => {
		const store = new NotificationsStore();
		store.sync("offline", true, "You are offline", { kind: "error" });
		store.sync("offline", true, "You are offline", { kind: "error" });
		expect(store.items).toHaveLength(1);
		store.sync("offline", false, "You are offline");
		expect(store.items).toHaveLength(0);
	});
});
