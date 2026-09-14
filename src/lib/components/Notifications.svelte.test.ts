import { notifications } from "$lib/state/notifications.svelte";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import Notifications from "./Notifications.svelte";

describe("Notifications", () => {
	beforeEach(() => {
		// Snapshot the ids first: dismiss() replaces the list while we iterate.
		for (const id of notifications.items.map((n) => n.id)) notifications.dismiss(id);
	});
	test("renders each notice with its tone and dismisses on click", async () => {
		const user = userEvent.setup();
		render(Notifications);
		notifications.notify("Song settings saved", { timeout: null });
		notifications.notify("Upload failed", { kind: "error" });
		expect(await screen.findByRole("status")).toHaveTextContent("Song settings saved");
		expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
		await user.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});
});
