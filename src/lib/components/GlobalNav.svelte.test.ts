import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";

const pageState = vi.hoisted(() => ({
	params: {} as Record<string, string>,
	url: new URL("https://stem-shovel.test/docs"),
	data: {} as Record<string, unknown>,
}));
vi.mock("$app/state", () => ({ page: pageState }));
vi.mock("$lib/remote/auth.remote", () => ({ signOut: fakeRemoteForm() }));

const { default: GlobalNav } = await import("./GlobalNav.svelte");

const memberships = [
	{ accountId: "a1", slug: "band", name: "The Band", role: "member" },
	{ accountId: "a2", slug: "mine", name: "My Studio", role: "owner" },
];

describe("GlobalNav", () => {
	test("a visitor sees Sign in with a way back to the page", () => {
		render(GlobalNav, { props: { user: null, memberships: [] } });
		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
			"href",
			"/sign-in?next=%2Fdocs",
		);
		expect(screen.queryByRole("button", { name: /Kevin|Studio/ })).toBeNull();
	});
	test("everyone gets the Tools menu; a member's has the Idea Recorder", async () => {
		const user = userEvent.setup();
		const { unmount } = render(GlobalNav, { props: { user: null, memberships: [] } });
		await user.click(screen.getByRole("button", { name: /Tools/ }));
		const names = screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
		expect(names).toEqual(["Tuner", "Metronome", "Drum Machine"]);
		expect(screen.getByRole("menuitem", { name: /Drum Machine/ })).toHaveAttribute(
			"href",
			"/drum-machine",
		);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).toBeNull();
		unmount();
		render(GlobalNav, {
			props: { user: { name: "Kevin" }, memberships, currentSlug: "mine" },
		});
		await user.click(screen.getByRole("button", { name: /Tools/ }));
		expect(screen.getByRole("menuitem", { name: /Idea Recorder/ })).toHaveAttribute(
			"href",
			"/mine/ideas/recorder",
		);
		// Opening the account menu closes the tools menu
		await user.click(screen.getByRole("button", { name: /My Studio/ }));
		expect(screen.getAllByRole("menu")).toHaveLength(1);
		expect(screen.getByRole("menu")).toHaveAttribute("aria-label", "Account menu");
	});
	test("the account menu names the current account, roles, other accounts and Your accounts", async () => {
		const user = userEvent.setup();
		render(GlobalNav, {
			props: {
				user: { name: "Kevin", email: "kevin@example.com" },
				memberships,
				currentSlug: "mine",
			},
		});
		const button = screen.getByRole("button", { name: /My Studio/ });
		expect(button).toHaveAttribute("aria-expanded", "false");
		await user.click(button);
		const menu = screen.getByRole("menu");
		expect(menu).toHaveTextContent("My Studio · owner");
		expect(screen.getByRole("menuitem", { name: /Projects/ })).toHaveAttribute(
			"href",
			"/mine/projects",
		);
		expect(screen.getByRole("menuitem", { name: /The Band/ })).toHaveTextContent("member");
		expect(screen.getByRole("menuitem", { name: /Your accounts/ })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: /Admin/ })).toBeNull();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).toBeNull();
	});
	test("a system admin gets the Admin item", async () => {
		const user = userEvent.setup();
		render(GlobalNav, {
			props: { user: { name: "Kevin", isSystemAdmin: true }, memberships, currentSlug: "mine" },
		});
		await user.click(screen.getByRole("button", { name: /My Studio/ }));
		expect(screen.getByRole("menuitem", { name: /Admin/ })).toHaveAttribute("href", "/admin");
	});
});
