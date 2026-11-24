import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";
import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({ notify: vi.fn() }));
const accept = fakeRemoteForm();
vi.mock("#lib/remote/accounts.remote.js", () => ({ acceptInvitation: accept }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));

const { default: DashboardInvitations } = await import("./DashboardInvitations.svelte");

const toAccount = {
	id: "inv1",
	token: "t".repeat(32),
	role: "admin",
	expiresAt: new Date(2026, 11, 1, 12),
	account: { name: "Night Shift", slug: "ns" },
	project: null,
	inviter: { name: "Pat" },
};
const toProject = {
	...toAccount,
	id: "inv2",
	token: "p".repeat(32),
	role: "viewer",
	project: { name: "The Album" },
	inviter: null,
};
const submit = accept.submit as ReturnType<typeof vi.fn>;

describe("DashboardInvitations", () => {
	beforeEach(() => {
		h.notify.mockReset();
		submit.mockReset().mockResolvedValue(true);
	});

	test("nothing at all without invitations", () => {
		const { container } = render(DashboardInvitations, { props: { invitations: [] } });
		expect(container.querySelector("section")).toBeNull();
	});

	test("an account's invitation says who sent it, the role and when it expires, with a Join button carrying its token", () => {
		const { container } = render(DashboardInvitations, { props: { invitations: [toAccount] } });
		const row = within(screen.getByRole("list", { name: "Invitations" })).getByRole("listitem");
		expect(row).toHaveTextContent("Pat invited you to join Night Shift as an admin.");
		expect(row).toHaveTextContent("Expires Dec 1, 2026");
		expect(within(row).getByRole("button", { name: "Join Night Shift" })).toBeInTheDocument();
		expect(container.querySelector<HTMLInputElement>('input[name="token"]')?.value).toBe(
			"t".repeat(32),
		);
	});

	test("a project viewer's invitation names the project and its account, and reads without a sender", () => {
		render(DashboardInvitations, { props: { invitations: [toProject] } });
		const row = screen.getByRole("listitem");
		expect(row).toHaveTextContent(
			"You were invited to listen to The Album, a project of Night Shift, and comment on it.",
		);
		expect(within(row).getByRole("button", { name: "Open The Album" })).toBeInTheDocument();
	});

	test("without a token (someone else's dashboard) the invitation is listed with no button", () => {
		render(DashboardInvitations, { props: { invitations: [{ ...toAccount, token: null }] } });
		expect(screen.getByRole("listitem")).toHaveTextContent("Night Shift");
		expect(screen.queryByRole("button")).toBeNull();
	});

	test("pressing Join submits; a refusal is shown as an error notification", async () => {
		render(DashboardInvitations, { props: { invitations: [toAccount] } });
		await userEvent.click(screen.getByRole("button", { name: "Join Night Shift" }));
		expect(submit).toHaveBeenCalledTimes(1);
		expect(h.notify).not.toHaveBeenCalled();

		submit.mockRejectedValueOnce({
			status: 400,
			body: { message: "This account has no seats left." },
		});
		await userEvent.click(screen.getByRole("button", { name: "Join Night Shift" }));
		expect(h.notify).toHaveBeenCalledWith("This account has no seats left.", { kind: "error" });
	});
});
