import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("#lib/remote/songs.remote.js", () => ({
	renameStem: vi.fn(),
	reorderStems: vi.fn(),
	setSongVersion: vi.fn(),
	setStemTint: vi.fn(),
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: StemVersionOffer } = await import("./StemVersionOffer.svelte");
const { StemActions } = await import("#lib/state/stemActions.svelte.js");

function setup(canEdit = true) {
	const actions = new StemActions({
		song: () => ({ id: "song1", version: "1.2.3" }),
		onsaved: vi.fn(),
	});
	const bump = vi.spyOn(actions, "bump").mockResolvedValue();
	render(StemVersionOffer, { props: { actions, version: "1.2.3", canEdit } });
	return { actions, bump };
}

describe("StemVersionOffer", () => {
	test("nothing until stems change", () => {
		setup();
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("the offer names the three next versions; each bumps at its level", async () => {
		const { actions, bump } = setup();
		actions.offer();
		flushSync();
		expect(screen.getByRole("status")).toHaveTextContent(
			"Stems changed. Bump the song version from v1.2.3?",
		);
		await fireEvent.click(screen.getByRole("button", { name: "1.2.4" }));
		expect(bump).toHaveBeenCalledWith("patch");
		await fireEvent.click(screen.getByRole("button", { name: "1.3.0" }));
		expect(bump).toHaveBeenCalledWith("minor");
		await fireEvent.click(screen.getByRole("button", { name: "2.0.0" }));
		expect(bump).toHaveBeenCalledWith("major");
	});

	test("Keep dismisses the offer", async () => {
		const { actions } = setup();
		actions.offer();
		flushSync();
		await fireEvent.click(screen.getByRole("button", { name: "Keep v1.2.3" }));
		expect(actions.versionOffer).toBe(false);
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("a listener never sees it", () => {
		const { actions } = setup(false);
		actions.offer();
		flushSync();
		expect(screen.queryByRole("status")).toBeNull();
	});
});
