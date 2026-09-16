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
		expect(screen.queryByRole("button", { name: /menu/i })).toBeNull();
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
		const button = screen.getByRole("button", { expanded: false });
		expect(button).toHaveTextContent("My Studio");
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
		await user.click(screen.getByRole("button", { expanded: false }));
		expect(screen.getByRole("menuitem", { name: /Admin/ })).toHaveAttribute("href", "/admin");
	});
});
