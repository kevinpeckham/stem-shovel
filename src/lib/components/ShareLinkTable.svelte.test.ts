import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import type { AccountShareLink } from "#lib/utils/accountShareLinkOf.js";

/**
 * The account's Viewing links list (/[account]/links): open links first,
 * the rest folded under a count; titles link to the page each opens;
 * Copy link for every member, Revoke for editors only.
 */
const h = vi.hoisted(() => ({
	notify: vi.fn(),
	page: { url: new URL("http://localhost/") },
}));
vi.mock("$app/state", () => ({ page: h.page }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/remote/share.remote.js", () => ({
	revokeShareLink: { for: () => ({ fields: { id: { as: () => ({}) } }, pending: false }) },
}));

const { default: ShareLinkTable } = await import("./ShareLinkTable.svelte");

const link = (over: Partial<AccountShareLink> & { id: string }): AccountShareLink => ({
	code: `CODE${over.id.toUpperCase()}`.padEnd(8, "X"),
	note: "",
	uses: 0,
	maxUses: null,
	expiresAt: null,
	createdAt: new Date(2026, 9, 18),
	revokedAt: null,
	createdByName: "Kevin",
	state: "open",
	kind: "song",
	title: "Eat All the Clocks",
	path: "/mmkk/projects/lp/clocks",
	...over,
});

const LINKS = [
	link({ id: "a", uses: 2, maxUses: 5, note: "for the label" }),
	link({ id: "b", kind: "project", title: "LP", path: "/mmkk/projects/lp" }),
	link({
		id: "c",
		state: "revoked",
		kind: "set list",
		title: "Spring tour",
		path: "/mmkk/set-lists/l/show",
	}),
	link({ id: "d", state: "expired", kind: "session", title: "(deleted)", path: null }),
	link({ id: "e", state: "used up", createdByName: null }),
];

const rowsIn = (el: HTMLElement) => within(el).getAllByTestId("share-link-row");

describe("ShareLinkTable", () => {
	test("groups the open links and folds the rest under their count", () => {
		const { container } = render(ShareLinkTable, { links: LINKS, canEdit: true });
		const details = container.querySelector("details") as HTMLDetailsElement;
		expect(details.open).toBe(false);
		expect(within(details).getByText("Revoked, expired and used up (3)")).toBeTruthy();
		expect(rowsIn(details)).toHaveLength(3);
		expect(rowsIn(container)).toHaveLength(5);
		expect(screen.getByRole("heading", { name: "Open" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "No longer open" })).toBeTruthy();
	});

	test("links each title to the page it opens, and a deleted target to nothing", () => {
		const { container } = render(ShareLinkTable, { links: LINKS, canEdit: true });
		expect(screen.getByRole("link", { name: "LP" }).getAttribute("href")).toBe("/mmkk/projects/lp");
		expect(screen.getByRole("link", { name: "Spring tour" }).getAttribute("href")).toBe(
			"/mmkk/set-lists/l/show",
		);
		expect(screen.queryByRole("link", { name: "(deleted)" })).toBeNull();
		expect(within(container).getByText("(deleted)")).toBeTruthy();
	});

	test("shows the uses, the maker, the note and the state", () => {
		render(ShareLinkTable, { links: LINKS, canEdit: true });
		expect(
			screen.getByText(/2 of 5 used · made Oct 18, 2026 by Kevin · for the label/),
		).toBeTruthy();
		expect(screen.getByText(/by a former member/)).toBeTruthy();
		expect(screen.getByText("revoked")).toBeTruthy();
		expect(screen.getByText("used up")).toBeTruthy();
	});

	test("offers Revoke on open links to an editor only, Copy link to every member", () => {
		const { unmount } = render(ShareLinkTable, { links: LINKS, canEdit: true });
		expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
		expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(2);
		unmount();
		render(ShareLinkTable, { links: LINKS, canEdit: false });
		expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
		expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(2);
	});

	test("Copy link copies the code's own address", async () => {
		const user = userEvent.setup();
		const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		render(ShareLinkTable, { links: [LINKS[1]!], canEdit: false });
		await user.click(screen.getByRole("button", { name: "Copy link" }));
		expect(writeText).toHaveBeenCalledWith(`http://localhost/s/${LINKS[1]!.code}`);
		expect(h.notify).toHaveBeenCalledWith("Link copied");
	});

	test("says how to make one when there are none", () => {
		render(ShareLinkTable, { links: [], canEdit: true });
		expect(
			screen.getByText(
				"No viewing links yet. Make one from a song, a project, a session or a set list.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("heading")).toBeNull();
	});
});
