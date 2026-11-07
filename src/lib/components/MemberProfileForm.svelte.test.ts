import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * A member's row and its profile form over a stand-in remote form: Edit
 * swaps the row for the form, Save submits through `enhance` and goes back
 * to the row with "Profile saved", Cancel goes back without submitting.
 */
const h = vi.hoisted(() => {
	const submit = vi.fn(async () => {});
	const set = vi.fn();
	const field = {
		as: (type: string, value?: unknown) => ({ type, value }),
		issues: () => undefined,
	};
	const fields = new Proxy({ set } as Record<string, unknown>, {
		get: (t, k) => (k === "set" ? t.set : field),
	});
	const form = {
		enhance: (cb: (o: { submit: () => Promise<void> }) => Promise<void>) => ({
			method: "POST",
			onsubmit: (ev: Event) => {
				ev.preventDefault();
				void cb({ submit });
			},
		}),
		fields,
		pending: 0,
		result: { ok: true },
		for: () => form,
	};
	return { submit, set, form };
});
vi.mock("#lib/remote/memberProfiles.remote.js", () => ({ updateMemberProfile: h.form }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn(async () => {}) }));

const { default: MemberCard } = await import("./MemberCard.svelte");
const { notify } = await import("#lib/state/notifications.svelte.js");

const member = {
	userId: "user1",
	name: "Kim Deal",
	email: "kim@example.com",
	role: "member" as const,
	phone: "555 0100",
	instruments: "bass, vocals",
	notes: "",
};

const props = { member, accountId: "acct1", canEdit: true };
const edit = () => screen.getByRole("button", { name: "Edit Kim Deal's profile" });

describe("MemberProfileForm", () => {
	test("the row reads the profile; no Edit without canEdit", () => {
		render(MemberCard, { props: { ...props, canEdit: false } });
		expect(screen.getByText("bass, vocals")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "555 0100" })).toHaveAttribute("href", "tel:555 0100");
		expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
	});

	test("Edit opens the form; Save submits, notifies and goes back to the row", async () => {
		render(MemberCard, { props });
		await fireEvent.click(edit());
		const form = screen.getByRole("form", { name: "Kim Deal's profile" });
		expect(screen.getByLabelText("Phone")).toBeInTheDocument();
		expect(screen.getByLabelText("Instruments")).toBeInTheDocument();
		expect(screen.getByLabelText("Notes")).toBeInTheDocument();
		await fireEvent.submit(form);
		await waitFor(() => expect(notify).toHaveBeenCalledWith("Profile saved"));
		expect(h.submit).toHaveBeenCalledOnce();
		await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
		expect(edit()).toBeInTheDocument();
	});

	test("Cancel restores the row without submitting and forgets the typed values", async () => {
		h.submit.mockClear();
		render(MemberCard, { props });
		await fireEvent.click(edit());
		await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("form")).toBeNull();
		expect(screen.getByText("bass, vocals")).toBeInTheDocument();
		expect(h.submit).not.toHaveBeenCalled();
		await waitFor(() => expect(h.set).toHaveBeenCalled());
	});
});
